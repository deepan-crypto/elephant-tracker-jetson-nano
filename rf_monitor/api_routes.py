"""
rf_monitor/api_routes.py
========================
FastAPI router exposing RF monitoring and threat fusion data.
Mounted on the FastAPI app in main_rf.py on port 8001.
Node.js server proxies /api/rf-status and /api/rf-logs to this service.
"""
import logging
from typing import Optional
from datetime import datetime, timezone
from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Depends, Request, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from .rf_service import rf_service, RFReading
from .threat_fusion import threat_engine, ThreatLevel
from .rf_logger import (
    get_recent_rf_logs,
    get_intrusion_rf_logs,
    get_recent_threat_logs,
    log_rf_event,
    acknowledge_threat,
)
from .config import RF_CENTER_FREQ_HZ, RF_SPAN_HZ, RF_THRESHOLD_DBM

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["RF Monitoring"])

# ── Simple JWT verification (same secret as Node backend) ─────────────────────

import os
JWT_SECRET = os.getenv("JWT_SECRET", "eletrack_ai_secure_secret_key_2026")

security = HTTPBearer(auto_error=False)

def _verify_jwt(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if credentials is None:
        raise HTTPException(status_code=403, detail="No token provided")
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── RF Status Endpoints ────────────────────────────────────────────────────────

@router.get("/rf-status")
def get_rf_status():
    """
    Current RF reading (latest scan result).
    Open endpoint — polled by Node.js proxy frequently.
    """
    reading = rf_service.latest_reading
    if reading is None:
        return {
            "status":           "UNKNOWN",
            "max_power_dbm":    None,
            "threshold_dbm":    RF_THRESHOLD_DBM,
            "center_freq_hz":   RF_CENTER_FREQ_HZ,
            "span_hz":          RF_SPAN_HZ,
            "timestamp":        datetime.now(timezone.utc).isoformat(),
            "service_running":  rf_service.is_running,
            "message":          "Service initializing..."
        }
    return {
        "status":           reading.status,
        "max_power_dbm":    reading.max_power_dbm,
        "threshold_dbm":    reading.threshold_dbm,
        "center_freq_hz":   reading.center_frequency_hz,
        "span_hz":          reading.span_hz,
        "timestamp":        reading.timestamp,
        "scan_duration_ms": reading.scan_duration_ms,
        "service_running":  rf_service.is_running,
        "error":            reading.error,
    }


@router.get("/rf-status/history")
def get_rf_history():
    """Return power readings from last 50 scans for graph rendering."""
    history = rf_service.history[:50]
    return {
        "count": len(history),
        "readings": [
            {
                "timestamp":     r.timestamp,
                "max_power_dbm": r.max_power_dbm,
                "status":        r.status,
            }
            for r in history
        ]
    }


@router.get("/rf-logs")
def get_rf_logs(limit: int = 50, user=Depends(_verify_jwt)):
    """Return paginated RF scan history from MongoDB. JWT protected."""
    logs = get_recent_rf_logs(limit=min(limit, 200))
    return {"count": len(logs), "logs": logs}


@router.get("/rf-logs/intrusions")
def get_rf_intrusions(limit: int = 20, user=Depends(_verify_jwt)):
    """Return only INTRUSION events. JWT protected."""
    logs = get_intrusion_rf_logs(limit=min(limit, 100))
    return {"count": len(logs), "logs": logs}


# ── Threat Level Endpoints ─────────────────────────────────────────────────────

@router.get("/threat-status")
def get_threat_status():
    """Current fused threat level. Open endpoint for real-time polling."""
    state = threat_engine.current_state
    return {
        "threat_level":      state.threat_level,
        "elephant_detected": state.elephant_detected,
        "rf_status":         state.rf_status,
        "color":             state.color,
        "priority":          state.priority,
        "description":       state.description,
        "timestamp":         state.timestamp,
    }


@router.get("/threat-logs")
def get_threat_logs(limit: int = 50, user=Depends(_verify_jwt)):
    """Return threat event history. JWT protected."""
    logs = get_recent_threat_logs(limit=min(limit, 200))
    return {"count": len(logs), "logs": logs}


@router.post("/threat-logs/{threat_id}/acknowledge")
def acknowledge_threat_event(
    threat_id: str,
    user=Depends(_verify_jwt),
):
    """Forest officer acknowledges a threat. JWT protected."""
    success = acknowledge_threat(threat_id, user.get("username", "unknown"))
    if not success:
        raise HTTPException(status_code=404, detail="Threat not found")
    return {"acknowledged": True, "threat_id": threat_id}


# ── Internal Ingest Endpoint (called by Jetson detection Python) ───────────────

@router.post("/rf-ingest")
async def ingest_rf_reading(request: Request):
    """
    Internal endpoint for Python RF service to push readings to the Node.js server.
    Also updates the threat fusion engine.
    Called every RF_SCAN_INTERVAL_SEC seconds.
    """
    try:
        data = await request.json()
        rf_status         = data.get("status", "SAFE")
        elephant_detected = data.get("elephant_detected", False)
        location          = data.get("location", None)

        # Update threat fusion
        new_state = threat_engine.update(
            elephant_detected=elephant_detected,
            rf_status=rf_status,
            location=location,
        )

        return {
            "received":    True,
            "threat_level": new_state.threat_level,
            "timestamp":    new_state.timestamp,
        }
    except Exception as e:
        logger.error(f"❌ [RF Ingest] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Scan Trigger (manual scan request) ────────────────────────────────────────

@router.post("/rf-scan")
def trigger_scan(user=Depends(_verify_jwt)):
    """Trigger an immediate RF scan. Returns result directly (blocking). JWT protected."""
    if not rf_service.is_running:
        raise HTTPException(status_code=503, detail="RF Monitor service not running")
    reading = rf_service.latest_reading
    if reading is None:
        raise HTTPException(status_code=503, detail="No scan data yet")
    return {
        "status":       reading.status,
        "max_power_dbm": reading.max_power_dbm,
        "timestamp":    reading.timestamp,
        "message":      "Latest cached scan returned (hardware scans every interval)",
    }
