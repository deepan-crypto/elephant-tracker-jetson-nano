"""
rf_monitor/main_rf.py
=====================
Entry point for the RF Monitoring FastAPI service.
Run independently on port 8001 alongside Node.js backend (port 5000).

Usage:
  python -m rf_monitor.main_rf           # production
  RF_SIMULATE=true python -m rf_monitor.main_rf    # no hardware needed

The service:
  1. Starts RFMonitorService as a daemon background thread
  2. On each new RF reading: logs to MongoDB + pushes to Node.js /api/rf-ingest
  3. Provides FastAPI REST endpoints for the React dashboard
"""
import os
import sys
import time
import logging
import asyncio
import threading
import httpx
from contextlib import asynccontextmanager
from dataclasses import asdict

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .rf_service import rf_service, RFReading
from .threat_fusion import threat_engine, ThreatState
from .rf_logger import log_rf_event
from .api_routes import router
from .config import RF_API_PORT, RF_INGEST_ENDPOINT, RF_SCAN_INTERVAL_SEC

# ── Logging setup ──────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("rf_monitor.main")


# ── RF reading push loop ───────────────────────────────────────────────────────

def _push_loop():
    """
    Background thread: every RF_SCAN_INTERVAL_SEC, reads latest RF result,
    logs it to MongoDB, and POSTs to Node.js /api/rf-ingest for WebSocket broadcast.
    Uses httpx synchronous client (no event loop needed in thread).
    """
    # Wait for first reading to appear
    time.sleep(RF_SCAN_INTERVAL_SEC + 1)

    last_ts = None
    with httpx.Client(timeout=5.0) as client:
        while True:
            reading = rf_service.latest_reading
            if reading and reading.timestamp != last_ts:
                last_ts = reading.timestamp

                # 1. Write RF event to MongoDB
                log_rf_event(reading)

                # 2. Push to Node.js for WebSocket broadcast
                try:
                    payload = {
                        "status":           reading.status,
                        "max_power_dbm":    reading.max_power_dbm,
                        "threshold_dbm":    reading.threshold_dbm,
                        "center_freq_hz":   reading.center_frequency_hz,
                        "span_hz":          reading.span_hz,
                        "timestamp":        reading.timestamp,
                        "scan_duration_ms": reading.scan_duration_ms,
                        # elephant_detected is set by YOLO side; default False here
                        "elephant_detected": False,
                    }
                    resp = client.post(RF_INGEST_ENDPOINT, json=payload, timeout=4.0)
                    if resp.status_code != 200:
                        logger.warning(f"⚠️  [Push] Node ingest returned {resp.status_code}")
                except Exception as e:
                    logger.warning(f"⚠️  [Push] Failed to push to Node: {e}")

            time.sleep(RF_SCAN_INTERVAL_SEC)


# ── FastAPI lifecycle ──────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start RF service and push loop before serving requests."""
    logger.info("🚀 RF Monitor Service starting...")

    # Start hardware scanning
    rf_service.start()

    # Start the push loop in daemon thread
    push_thread = threading.Thread(target=_push_loop, daemon=True, name="rf-push")
    push_thread.start()

    logger.info(f"✅ RF Service started | FastAPI on port {RF_API_PORT}")
    yield
    # Shutdown
    rf_service.stop()
    logger.info("RF Monitor Service stopped")


# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="EleTrack AI — RF Monitor Service",
    description="Rigol DSA832E spectrum analyzer integration for poacher RF detection",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Locked down in production via env
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {
        "service":  "EleTrack AI RF Monitor",
        "version":  "1.0.0",
        "status":   "running" if rf_service.is_running else "stopped",
        "docs":     f"http://localhost:{RF_API_PORT}/docs",
    }


@app.get("/health")
def health():
    reading = rf_service.latest_reading
    return {
        "service_running": rf_service.is_running,
        "last_scan":       reading.timestamp if reading else None,
        "rf_status":       reading.status if reading else "UNKNOWN",
    }


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "rf_monitor.main_rf:app",
        host="0.0.0.0",
        port=RF_API_PORT,
        reload=False,
        log_level="info",
    )
