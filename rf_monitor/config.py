"""
rf_monitor/config.py
====================
All RF monitoring configuration loaded from environment variables.
Designed for deployment on NVIDIA Jetson Orin Nano with Rigol DSA832E.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── VISA / Instrument ─────────────────────────────────────────────────────────
# Default matches Rigol DSA832E USB descriptor — update with real serial number
VISA_RESOURCE: str = os.getenv(
    "VISA_RESOURCE",
    "USB0::0x1AB1::0x0960::DSA832-XXXXXXXX::INSTR"
)

# ── Frequency Settings ────────────────────────────────────────────────────────
# 915 MHz: ISM band commonly used by walkie-talkies, LoRa, and illegal comm devices
RF_CENTER_FREQ_HZ: float = float(os.getenv("RF_CENTER_FREQ_HZ", 915_000_000))
RF_SPAN_HZ: float         = float(os.getenv("RF_SPAN_HZ",         50_000_000))
RF_RBW_HZ: float          = float(os.getenv("RF_RBW_HZ",          100_000))
RF_VBW_HZ: float          = float(os.getenv("RF_VBW_HZ",          100_000))

# ── Detection Thresholds ──────────────────────────────────────────────────────
# Default −40 dBm: strong enough to indicate nearby transmission, not ambient noise
RF_THRESHOLD_DBM: float   = float(os.getenv("RF_THRESHOLD_DBM", -40.0))
RF_SCAN_INTERVAL_SEC: int = int(os.getenv("RF_SCAN_INTERVAL_SEC", 5))

# ── MongoDB ───────────────────────────────────────────────────────────────────
MONGO_URI: str   = os.getenv("MONGO_URI", "mongodb://localhost:27017/eletrack-ai")
MONGO_DB: str    = os.getenv("MONGO_DB",  "eletrack-ai")

# ── Node.js Backend: RF ingest endpoint ──────────────────────────────────────
NODE_BACKEND_URL: str = os.getenv("NODE_BACKEND_URL", "http://localhost:5000")
RF_INGEST_ENDPOINT: str = f"{NODE_BACKEND_URL}/api/rf-ingest"

# ── FastAPI service port (runs alongside Node on different port) ──────────────
RF_API_PORT: int = int(os.getenv("RF_API_PORT", 8001))

# ── Simulation mode (no real hardware) ───────────────────────────────────────
RF_SIMULATE: bool = os.getenv("RF_SIMULATE", "false").lower() == "true"




