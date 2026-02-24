"""
rf_monitor/rf_service.py
========================
Core RF monitoring service using PyVISA to control the Rigol DSA832E Spectrum Analyzer
via SCPI commands over USB. Runs as a background daemon thread to avoid blocking YOLO inference.

Hardware: Rigol DSA832E Spectrum Analyzer
Connection: USB / VISA (pyvisa + pyvisa-py or NI-VISA backend)
Protocol: SCPI (Standard Commands for Programmable Instruments)
"""
import time
import random
import threading
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, List

import numpy as np

from .config import (
    VISA_RESOURCE, RF_CENTER_FREQ_HZ, RF_SPAN_HZ,
    RF_RBW_HZ, RF_VBW_HZ, RF_THRESHOLD_DBM,
    RF_SCAN_INTERVAL_SEC, RF_SIMULATE
)

logger = logging.getLogger(__name__)


# ── Data Model ────────────────────────────────────────────────────────────────

@dataclass
class RFReading:
    """Single RF measurement result from the spectrum analyzer."""
    timestamp: str
    center_frequency_hz: float
    span_hz: float
    max_power_dbm: float
    threshold_dbm: float
    status: str          # "SAFE" | "INTRUSION"
    raw_trace_peak: float = 0.0
    scan_duration_ms: float = 0.0
    error: Optional[str] = None
    trace_data: List[float] = field(default_factory=list)   # last N dBm readings


# ── SCPI Controller ────────────────────────────────────────────────────────────

class RigolDSA832E:
    """
    Thin wrapper around pyvisa Resource for the Rigol DSA832E.
    All public methods issue SCPI commands and return Python native types.
    """

    def __init__(self, resource_name: str):
        self._rm = None
        self._inst = None
        self._resource_name = resource_name

    def connect(self) -> bool:
        """Open VISA connection. Returns True on success."""
        try:
            import pyvisa
            self._rm = pyvisa.ResourceManager()
            self._inst = self._rm.open_resource(self._resource_name)
            self._inst.timeout = 10_000          # 10-second timeout for sweeps
            self._inst.write_termination = '\n'
            self._inst.read_termination  = '\n'
            idn = self._inst.query("*IDN?").strip()
            logger.info(f"✅ [VISA] Connected: {idn}")
            return True
        except Exception as e:
            logger.error(f"❌ [VISA] Connection failed: {e}")
            return False

    def disconnect(self):
        """Close VISA connection gracefully."""
        try:
            if self._inst:
                self._inst.close()
            if self._rm:
                self._rm.close()
        except Exception:
            pass

    def configure(self,
                  center_freq: float,
                  span: float,
                  rbw: float = RF_RBW_HZ,
                  vbw: float = RF_VBW_HZ):
        """Set analyzer center frequency, span, RBW, VBW."""
        cmds = [
            f":SENS:FREQ:CENT {center_freq:.0f}",   # e.g. 915000000
            f":SENS:FREQ:SPAN {span:.0f}",           # e.g. 50000000
            f":SENS:BAND:RES {rbw:.0f}",             # Resolution BW
            f":SENS:BAND:VID {vbw:.0f}",             # Video BW
            ":SENS:SWE:POIN 601",                    # 601 trace points
            ":TRIG:SOUR IMM",                        # Free-run sweep
        ]
        for cmd in cmds:
            self._inst.write(cmd)
        logger.debug(f"[VISA] Configured: CF={center_freq/1e6:.1f}MHz SPAN={span/1e6:.1f}MHz")

    def sweep_and_read(self) -> List[float]:
        """
        Trigger a single sweep and return trace data as a list of dBm values.
        Returns empty list on failure.
        """
        try:
            self._inst.write(":INIT:IMM")                   # Trigger sweep
            self._inst.query("*OPC?")                       # Wait for sweep complete
            raw = self._inst.query(":TRAC:DATA? TRACE1")    # Fetch trace
            # DSA832E returns comma-separated list of dBm floats
            values = [float(v) for v in raw.strip().split(",") if v.strip()]
            return values
        except Exception as e:
            logger.warning(f"⚠️  [VISA] Sweep failed: {e}")
            return []


# ── Simulation Mode ────────────────────────────────────────────────────────────

class SimulatedDSA832E(RigolDSA832E):
    """
    Simulated spectrum analyzer for testing without real hardware.
    Produces realistic-looking random RF noise with occasional simulated spikes.
    """

    def connect(self) -> bool:
        logger.warning("⚠️  [SIMULATE] Using simulated Rigol DSA832E — no real hardware")
        return True

    def disconnect(self):
        pass

    def configure(self, center_freq, span, rbw=None, vbw=None):
        logger.debug(f"[SIMULATE] Configured: CF={center_freq/1e6:.1f}MHz")

    def sweep_and_read(self) -> List[float]:
        # Baseline noise floor around -80 dBm with random occasional spike
        n_points = 601
        noise = np.random.normal(-80, 3, n_points)
        # ~15% chance of a transmission spike that triggers INTRUSION
        if random.random() < 0.15:
            spike_center = random.randint(100, 500)
            spike_width  = random.randint(5, 20)
            spike_amp    = random.uniform(-38, -20)   # above -40 threshold
            noise[spike_center - spike_width:spike_center + spike_width] = spike_amp
            logger.debug(f"[SIMULATE] 🔺 Spike injected at point {spike_center}: {spike_amp:.1f} dBm")
        return noise.tolist()


# ── RF Monitor Service ─────────────────────────────────────────────────────────

class RFMonitorService:
    """
    Background thread service that continuously scans RF spectrum and maintains
    the latest reading. Thread-safe; designed to coexist with YOLO inference loop.
    """

    def __init__(self):
        self._analyzer: RigolDSA832E = (
            SimulatedDSA832E(VISA_RESOURCE) if RF_SIMULATE
            else RigolDSA832E(VISA_RESOURCE)
        )
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._latest: Optional[RFReading] = None
        self._history: List[RFReading] = []   # ring buffer, max 200 readings

    # ── Public API ─────────────────────────────────────────────────────────────

    @property
    def latest_reading(self) -> Optional[RFReading]:
        with self._lock:
            return self._latest

    @property
    def history(self) -> List[RFReading]:
        """Return copy of reading history (newest first)."""
        with self._lock:
            return list(reversed(self._history))

    @property
    def is_running(self) -> bool:
        return self._running

    def start(self):
        """Start background scanning thread."""
        if self._running:
            return
        if not self._analyzer.connect():
            logger.error("❌ RF Monitor failed to connect — service not started")
            return
        self._analyzer.configure(RF_CENTER_FREQ_HZ, RF_SPAN_HZ)
        self._running = True
        self._thread = threading.Thread(target=self._scan_loop, daemon=True, name="rf-monitor")
        self._thread.start()
        logger.info(f"✅ RF Monitor started | CF={RF_CENTER_FREQ_HZ/1e6:.1f}MHz | interval={RF_SCAN_INTERVAL_SEC}s")

    def stop(self):
        """Gracefully stop the scanning thread."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=RF_SCAN_INTERVAL_SEC + 2)
        self._analyzer.disconnect()
        logger.info("RF Monitor stopped")

    # ── Internal loop ──────────────────────────────────────────────────────────

    def _scan_loop(self):
        while self._running:
            t_start = time.perf_counter()
            reading = self._do_scan()
            scan_ms = (time.perf_counter() - t_start) * 1000
            reading.scan_duration_ms = round(scan_ms, 1)

            with self._lock:
                self._latest = reading
                self._history.append(reading)
                if len(self._history) > 200:       # ring buffer cap
                    self._history.pop(0)

            status_icon = "🔴" if reading.status == "INTRUSION" else "🟢"
            logger.info(
                f"{status_icon} [RF] {reading.status} | "
                f"Peak: {reading.max_power_dbm:.1f} dBm | "
                f"Threshold: {reading.threshold_dbm:.1f} dBm | "
                f"Scan: {reading.scan_duration_ms}ms"
            )

            # Sleep for remaining interval time
            elapsed = time.perf_counter() - t_start
            sleep_for = max(0.0, RF_SCAN_INTERVAL_SEC - elapsed)
            time.sleep(sleep_for)

    def _do_scan(self) -> RFReading:
        ts = datetime.now(timezone.utc).isoformat()
        try:
            trace = self._analyzer.sweep_and_read()
            if not trace:
                return RFReading(
                    timestamp=ts,
                    center_frequency_hz=RF_CENTER_FREQ_HZ,
                    span_hz=RF_SPAN_HZ,
                    max_power_dbm=RF_THRESHOLD_DBM - 10,
                    threshold_dbm=RF_THRESHOLD_DBM,
                    status="SAFE",
                    error="Empty trace returned",
                )
            max_power = float(np.max(trace))
            status    = "INTRUSION" if max_power >= RF_THRESHOLD_DBM else "SAFE"
            # Store only last 50 trace peaks for the graph (not full 601 points)
            trace_peaks = trace[::12][:50]   # downsample to ~50 points
            return RFReading(
                timestamp=ts,
                center_frequency_hz=RF_CENTER_FREQ_HZ,
                span_hz=RF_SPAN_HZ,
                max_power_dbm=round(max_power, 2),
                threshold_dbm=RF_THRESHOLD_DBM,
                raw_trace_peak=round(max_power, 2),
                status=status,
                trace_data=trace_peaks,
            )
        except Exception as e:
            logger.error(f"❌ [RF] Scan error: {e}")
            return RFReading(
                timestamp=ts,
                center_frequency_hz=RF_CENTER_FREQ_HZ,
                span_hz=RF_SPAN_HZ,
                max_power_dbm=RF_THRESHOLD_DBM - 20,
                threshold_dbm=RF_THRESHOLD_DBM,
                status="SAFE",
                error=str(e),
            )


# ── Global Singleton ───────────────────────────────────────────────────────────
# Imported by api_routes.py and main_rf.py
rf_service = RFMonitorService()
