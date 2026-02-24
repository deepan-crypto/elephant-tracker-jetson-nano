"""
rf_monitor/rf_logger.py
=======================
MongoDB logging for RF scan events and threat events.
Uses pymongo directly (not Mongoose) since this is the Python side.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from pymongo import MongoClient, DESCENDING
from pymongo.collection import Collection

from .config import MONGO_URI, MONGO_DB

logger = logging.getLogger(__name__)

# ── MongoDB client (lazy singleton) ───────────────────────────────────────────

_client: Optional[MongoClient] = None
_db = None


def _get_db():
    global _client, _db
    if _db is None:
        try:
            _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            _db = _client[MONGO_DB]
            # Create TTL indexes on first connection
            _ensure_indexes(_db)
            logger.info("✅ [RF Logger] MongoDB connected")
        except Exception as e:
            logger.error(f"❌ [RF Logger] MongoDB connection failed: {e}")
    return _db


def _ensure_indexes(db):
    """Create TTL and query indexes on all collections."""
    try:
        # rf_logs — auto-delete after 3 days
        db["rf_logs"].create_index("createdAt", expireAfterSeconds=259_200)
        db["rf_logs"].create_index([("status", DESCENDING), ("createdAt", DESCENDING)])

        # elephant_logs — auto-delete after 7 days
        db["elephant_logs"].create_index("createdAt", expireAfterSeconds=604_800)
        db["elephant_logs"].create_index([("createdAt", DESCENDING)])

        # threat_logs — auto-delete after 30 days
        db["threat_logs"].create_index("createdAt", expireAfterSeconds=2_592_000)
        db["threat_logs"].create_index([("threat_level", DESCENDING), ("createdAt", DESCENDING)])
        db["threat_logs"].create_index("acknowledged")

        logger.debug("[RF Logger] Indexes ensured")
    except Exception as e:
        logger.warning(f"⚠️  [RF Logger] Index creation warning: {e}")


# ── RF Log Operations ──────────────────────────────────────────────────────────

def log_rf_event(reading) -> Optional[str]:
    """
    Insert one RF reading into the rf_logs collection.
    reading: RFReading dataclass from rf_service.py
    Returns inserted document _id as string, or None on failure.
    """
    db = _get_db()
    if db is None:
        return None
    try:
        doc = {
            "timestamp":         reading.timestamp,
            "frequency_hz":      reading.center_frequency_hz,
            "span_hz":           reading.span_hz,
            "max_power_dbm":     reading.max_power_dbm,
            "threshold_dbm":     reading.threshold_dbm,
            "raw_trace_peak":    reading.raw_trace_peak,
            "status":            reading.status,
            "scan_duration_ms":  reading.scan_duration_ms,
            "error":             reading.error,
            "createdAt":         datetime.now(timezone.utc),
        }
        result = db["rf_logs"].insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        logger.warning(f"⚠️  [RF Logger] log_rf_event failed: {e}")
        return None


def get_recent_rf_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Return most recent RF log entries, newest first."""
    db = _get_db()
    if db is None:
        return []
    try:
        cursor = db["rf_logs"].find(
            {}, {"_id": 0}
        ).sort("createdAt", DESCENDING).limit(limit)
        return list(cursor)
    except Exception as e:
        logger.warning(f"⚠️  [RF Logger] get_recent_rf_logs failed: {e}")
        return []


def get_intrusion_rf_logs(limit: int = 20) -> List[Dict[str, Any]]:
    """Return only INTRUSION events."""
    db = _get_db()
    if db is None:
        return []
    try:
        cursor = db["rf_logs"].find(
            {"status": "INTRUSION"}, {"_id": 0}
        ).sort("createdAt", DESCENDING).limit(limit)
        return list(cursor)
    except Exception as e:
        logger.warning(f"⚠️  [RF Logger] get_intrusion_rf_logs failed: {e}")
        return []


# ── Threat Log Operations ──────────────────────────────────────────────────────

def log_threat_event(
    threat_level: str,
    elephant_detected: bool,
    rf_status: str,
    location: Optional[Dict] = None,
) -> Optional[str]:
    """
    Insert a fused threat event into threat_logs.
    threat_level: SAFE | WILDLIFE_ALERT | HUMAN_INTRUSION | CRITICAL_ALERT
    """
    db = _get_db()
    if db is None:
        return None
    try:
        doc = {
            "timestamp":          datetime.now(timezone.utc).isoformat(),
            "elephant_detected":  elephant_detected,
            "rf_status":          rf_status,
            "threat_level":       threat_level,
            "location":           location,
            "acknowledged":       False,
            "acknowledged_by":    None,
            "createdAt":          datetime.now(timezone.utc),
        }
        result = db["threat_logs"].insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        logger.warning(f"⚠️  [RF Logger] log_threat_event failed: {e}")
        return None


def get_recent_threat_logs(limit: int = 50) -> List[Dict[str, Any]]:
    """Return most recent threat events."""
    db = _get_db()
    if db is None:
        return []
    try:
        cursor = db["threat_logs"].find(
            {}, {"_id": 0}
        ).sort("createdAt", DESCENDING).limit(limit)
        return list(cursor)
    except Exception as e:
        logger.warning(f"⚠️  [RF Logger] get_recent_threat_logs failed: {e}")
        return []


def acknowledge_threat(threat_id: str, username: str) -> bool:
    """Mark a threat event as acknowledged by forest officer."""
    from bson import ObjectId
    db = _get_db()
    if db is None:
        return False
    try:
        result = db["threat_logs"].update_one(
            {"_id": ObjectId(threat_id)},
            {"$set": {"acknowledged": True, "acknowledged_by": username}}
        )
        return result.modified_count > 0
    except Exception as e:
        logger.warning(f"⚠️  [RF Logger] acknowledge_threat failed: {e}")
        return False


# ── Elephant Log Operations ────────────────────────────────────────────────────

def log_elephant_event(
    elephant_count: int,
    confidence_avg: float,
    location: Optional[Dict] = None,
    image_snapshot: Optional[str] = None,
    source: str = "jetson",
) -> Optional[str]:
    """Log an elephant detection event (called from Python detection side)."""
    db = _get_db()
    if db is None:
        return None
    try:
        doc = {
            "timestamp":       datetime.now(timezone.utc).isoformat(),
            "source":          source,
            "elephant_count":  elephant_count,
            "confidence_avg":  round(confidence_avg, 4),
            "location":        location,
            "image_snapshot":  image_snapshot,
            "createdAt":       datetime.now(timezone.utc),
        }
        result = db["elephant_logs"].insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        logger.warning(f"⚠️  [RF Logger] log_elephant_event failed: {e}")
        return None
