"""
demo_laptop_webcam.py — EleTrack AI Live Feed Demo (Laptop Webcam)
===================================================================
Fully self-contained demo — no YOLOv5, no PyTorch, no TelemetryUploader needed.
Just OpenCV + requests.

Requirements:
    pip install opencv-python requests

Run:
    python demo_laptop_webcam.py

What it does:
  1. Wakes the Render backend (handles Render free-tier cold-start delay)
  2. Opens your laptop webcam (camera index 0)
  3. Sends every Nth frame as a base64 JPEG to your backend
  4. Simulates a fake "Elephant" detection every 5 seconds
  5. Shows a local preview window — press Q to quit
"""

import cv2
import sys
import time
import math
import base64
import requests
from datetime import datetime

# ─── CONFIG — ONLY EDIT THESE ────────────────────────────────────────────────
# ⚠️  Replace with your actual Render backend URL (Render Dashboard → your service → URL at top)
BACKEND_URL  = "https://elephant-tracker-jetson-nano.onrender.com/api/telemetry"
HEALTH_URL   = BACKEND_URL.replace("/api/telemetry", "/health")
GPS_LAT      = 12.2958   # Mudumalai Wildlife Sanctuary coordinates
GPS_LON      = 76.6394
CAMERA_INDEX = 0         # 0 = built-in webcam; try 1 if it doesn't open
SEND_EVERY_N = 2         # send EVERY 2nd frame — ALWAYS, even with no detection
JPEG_QUALITY = 60        # 0-100, lower = smaller payload
# ─────────────────────────────────────────────────────────────────────────────


# ── Helpers ───────────────────────────────────────────────────────────────────

def encode_frame(frame):
    """Encode an OpenCV frame to a base64 data-URI string."""
    _, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    b64 = base64.b64encode(buf).decode('utf-8')
    return "data:image/jpeg;base64," + b64


def wake_backend(max_wait=45):
    """Ping /health until it responds — handles Render cold-start delay."""
    print(f"🔔 Waking backend at {HEALTH_URL} ...")
    start = time.time()
    while time.time() - start < max_wait:
        try:
            r = requests.get(HEALTH_URL, timeout=10)
            if r.status_code == 200:
                print(f"✅ Backend awake! ({time.time()-start:.1f}s)")
                return True
        except Exception:
            pass
        print(f"   ⏳ Still waking... ({int(time.time()-start)}s elapsed)")
        time.sleep(3)
    print(f"❌ Backend did not respond in {max_wait}s — check your BACKEND_URL.")
    return False


def send_frame(frame, hazards=None):
    """POST a single frame + optional hazard list to the backend."""
    if hazards is None:
        hazards = []
    payload = {
        "timestamp":    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "gps_location": {"lat": GPS_LAT, "lon": GPS_LON},
        "hazards":      hazards,
        "image_stream": encode_frame(frame)
    }
    try:
        r = requests.post(BACKEND_URL, json=payload,
                          timeout=15,
                          headers={"Content-Type": "application/json"})
        return r.status_code == 200, r.status_code
    except requests.exceptions.Timeout:
        return False, "timeout"
    except Exception as e:
        return False, str(e)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("  EleTrack AI — Laptop Webcam Demo")
    print("=" * 55)

    if "your-backend" in BACKEND_URL:
        print("\n⚠️  ERROR: You haven't set BACKEND_URL yet!")
        print("   Edit demo_laptop_webcam.py and replace:")
        print('   BACKEND_URL = "https://elephant-tracker-jetson-nano.onrender.com/api/telemetry"')
        print("   with your actual Render backend URL.\n")
        sys.exit(1)

    # Wake Render backend
    wake_backend(max_wait=45)

    # Open webcam
    print(f"\n📷 Opening webcam (index {CAMERA_INDEX})...")
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        print(f"❌ Could not open camera {CAMERA_INDEX}.")
        print("   Try changing CAMERA_INDEX to 1 at the top of this file.")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"✅ Webcam opened: {frame_w}×{frame_h}")
    print("\n🚀 Streaming started. Open your Vercel dashboard and log in.")
    print("   Fake elephant detection fires every 5 seconds to test alerts.")
    print("   Press  Q  in the preview window to quit.\n")

    frame_count  = 0
    sent_count   = 0
    error_count  = 0
    start_time   = time.time()

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("⚠️  Frame read failed — camera disconnected?")
                break

            frame_count += 1
            elapsed = time.time() - start_time

            # ── Fake detection: active for 2s out of every 5s cycle ──
            fake_active = math.floor(elapsed) % 5 < 2
            hazards = []
            if fake_active:
                cx, cy = frame_w // 2, frame_h // 2
                w, h   = 200, 120
                hazards = [{
                    "class":      0,
                    "name":       "Elephant",
                    "confidence": 0.91,
                    "xmin": cx - w // 2,
                    "ymin": cy - h // 2,
                    "xmax": cx + w // 2,
                    "ymax": cy + h // 2
                }]

            # ── Send to backend every Nth frame — ALWAYS, whether or not elephant detected ──
            # hazards = [] when nothing is detected; the backend still broadcasts the live image.
            if frame_count % SEND_EVERY_N == 0:
                ok, status = send_frame(frame, hazards)
                if ok:
                    sent_count += 1
                else:
                    error_count += 1
                    print(f"⚠️  Send failed: {status}")

            # ── Draw local preview ──
            display = frame.copy()
            if fake_active:
                h_ = hazards[0]
                cv2.rectangle(display,
                              (h_["xmin"], h_["ymin"]),
                              (h_["xmax"], h_["ymax"]),
                              (0, 0, 255), 2)
                cv2.putText(display, "ELEPHANT 91%",
                            (h_["xmin"], h_["ymin"] - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)

            bar = (f"Frame {frame_count} | Sent {sent_count} | "
                   f"Err {error_count} | {elapsed:.0f}s")
            cv2.rectangle(display, (0, 0), (frame_w, 28), (30, 30, 30), -1)
            cv2.putText(display, bar, (6, 19),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (200, 200, 200), 1)

            dot_color = (0, 0, 255) if fake_active else (0, 220, 0)
            cv2.circle(display, (frame_w - 16, 14), 7, dot_color, -1)

            cv2.imshow("EleTrack AI — Webcam Demo (Q to quit)", display)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    except KeyboardInterrupt:
        print("\n🛑 Interrupted.")

    finally:
        cap.release()
        cv2.destroyAllWindows()
        print(f"\n📊 Stats: {frame_count} frames | {sent_count} sent | {error_count} errors")
        print("✅ Demo stopped.")


if __name__ == "__main__":
    main()
