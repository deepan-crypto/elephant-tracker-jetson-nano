"""
rf_monitor/threat_fusion.py
===========================
Combines elephant detection status + RF signal status into a 4-level threat classification.
Logs significant state changes to MongoDB threat_logs collection.

Threat Level Matrix:
┌──────────────────┬──────────────┬──────────────────────┐
│ Elephant Present │  RF Status   │    Threat Level       │
├──────────────────┼──────────────┼──────────────────────┤
│       No         │    SAFE      │  SAFE                 │
│       Yes        │    SAFE      │  WILDLIFE_ALERT       │
│       No         │  INTRUSION   │  HUMAN_INTRUSION      │
│       Yes        │  INTRUSION   │  CRITICAL_ALERT       │
└──────────────────┴──────────────┴──────────────────────┘
"""
import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Callable

from .rf_logger import log_threat_event

logger = logging.getLogger(__name__)


# ── Threat Levels ─────────────────────────────────────────────────────────────

class ThreatLevel:
    SAFE            = "SAFE"
    WILDLIFE_ALERT  = "WILDLIFE_ALERT"
    HUMAN_INTRUSION = "HUMAN_INTRUSION"
    CRITICAL_ALERT  = "CRITICAL_ALERT"

    # Color mapping for frontend
    COLORS = {
        SAFE:            "#14532d",   # Dark green
        WILDLIFE_ALERT:  "#92400e",   # Amber
        HUMAN_INTRUSION: "#9a3412",   # Orange-red
        CRITICAL_ALERT:  "#7f1d1d",   # Deep red
    }

    # Priority order (higher = worse)
    PRIORITY = {
        SAFE:            0,
        WILDLIFE_ALERT:  1,
        HUMAN_INTRUSION: 2,
        CRITICAL_ALERT:  3,
    }


@dataclass
class ThreatState:
    """Current fused threat state of the whole system."""
    timestamp: str
    threat_level: str
    elephant_detected: bool
    rf_status: str
    color: str
    priority: int
    description: str


def _build_description(level: str, elephant: bool, rf: str) -> str:
    descriptions = {
        ThreatLevel.SAFE:
            "All systems normal. No elephant or RF intrusion detected.",
        ThreatLevel.WILDLIFE_ALERT:
            "🐘 Elephant detected near railway border. RF channel is clear.",
        ThreatLevel.HUMAN_INTRUSION:
            "📡 Suspicious RF signal detected. Possible illegal communication device.",
        ThreatLevel.CRITICAL_ALERT:
            "🚨 CRITICAL: Elephant present AND unauthorized RF signal detected — possible poacher activity!",
    }
    return descriptions.get(level, "Unknown threat state")


# ── Threat Fusion Engine ───────────────────────────────────────────────────────

class ThreatFusionEngine:
    """
    Stateful fusion engine that combines elephant + RF inputs into a threat level.
    Only logs to MongoDB when the threat level *changes* to avoid DB spam.
    External code can register callbacks triggered on any state change.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._current_state: ThreatState = ThreatState(
            timestamp=datetime.now(timezone.utc).isoformat(),
            threat_level=ThreatLevel.SAFE,
            elephant_detected=False,
            rf_status="SAFE",
            color=ThreatLevel.COLORS[ThreatLevel.SAFE],
            priority=0,
            description=_build_description(ThreatLevel.SAFE, False, "SAFE"),
        )
        self._callbacks: list[Callable[[ThreatState], None]] = []

    @property
    def current_state(self) -> ThreatState:
        with self._lock:
            return self._current_state

    def register_callback(self, fn: Callable[[ThreatState], None]):
        """Register a function called whenever threat level changes."""
        self._callbacks.append(fn)

    def update(
        self,
        elephant_detected: bool,
        rf_status: str,          # "SAFE" | "INTRUSION"
        location: Optional[dict] = None,
    ) -> ThreatState:
        """
        Compute new threat level from current inputs and update state.
        Logs to DB and fires callbacks only if level changes.
        """
        level = self._compute_level(elephant_detected, rf_status)
        ts    = datetime.now(timezone.utc).isoformat()

        new_state = ThreatState(
            timestamp=ts,
            threat_level=level,
            elephant_detected=elephant_detected,
            rf_status=rf_status,
            color=ThreatLevel.COLORS[level],
            priority=ThreatLevel.PRIORITY[level],
            description=_build_description(level, elephant_detected, rf_status),
        )

        with self._lock:
            prev_level = self._current_state.threat_level
            self._current_state = new_state

        # Only write to DB + fire callbacks on level change
        if level != prev_level:
            logger.info(
                f"⚠️  [THREAT] Level changed: {prev_level} → {level} "
                f"(elephant={elephant_detected}, rf={rf_status})"
            )
            # Non-blocking DB write
            threading.Thread(
                target=log_threat_event,
                args=(level, elephant_detected, rf_status, location),
                daemon=True,
            ).start()

            for cb in self._callbacks:
                try:
                    threading.Thread(target=cb, args=(new_state,), daemon=True).start()
                except Exception as e:
                    logger.warning(f"[THREAT] Callback error: {e}")

        return new_state

    @staticmethod
    def _compute_level(elephant: bool, rf: str) -> str:
        if elephant and rf == "INTRUSION":
            return ThreatLevel.CRITICAL_ALERT
        elif elephant and rf == "SAFE":
            return ThreatLevel.WILDLIFE_ALERT
        elif not elephant and rf == "INTRUSION":
            return ThreatLevel.HUMAN_INTRUSION
        else:
            return ThreatLevel.SAFE


# ── Global Singleton ───────────────────────────────────────────────────────────
threat_engine = ThreatFusionEngine()
