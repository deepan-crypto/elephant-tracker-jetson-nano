#!/usr/bin/env python3
"""
start_rf_monitor.py
===================
Convenience launcher for the RF Monitor Service.
Run from the project root: python start_rf_monitor.py

Tip: Use RF_SIMULATE=true to test without real hardware.
"""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(__file__))

if __name__ == "__main__":
    import uvicorn
    from rf_monitor.main_rf import app
    from rf_monitor.config import RF_API_PORT

    print("=" * 55)
    print(" EleTrack AI — RF Monitor Service")
    print(f" Rigol DSA832E SCPI/USB Integration")
    print(f" Starting FastAPI on port {RF_API_PORT}")
    print(f" Docs: http://localhost:{RF_API_PORT}/docs")
    print("=" * 55)

    uvicorn.run(app, host="0.0.0.0", port=RF_API_PORT, log_level="info")