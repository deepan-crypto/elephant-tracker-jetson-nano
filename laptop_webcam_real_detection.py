"""
laptop_webcam_real_detection.py — EleTrack AI Live Detection (Laptop Webcam)
=============================================================================
Uses the actual YOLOv5 model (best.pt) for real elephant detection.
NOT a demo/simulation — this runs actual inference.

Requirements:
    pip install torch torchvision opencv-python requests

Run:
    python laptop_webcam_real_detection.py

What it does:
  1. Loads the trained YOLOv5 elephant detection model (best.pt)
  2. Opens your laptop webcam
  3. Runs real inference on each frame
  4. Sends frames + actual detections to the backend
  5. Shows live preview with bounding boxes — press Q to quit
"""

import cv2
import sys
import time
import base64
import requests
import threading
import torch
from datetime import datetime

# ── Bee-buzz sound ────────────────────────────────────────────────────────────
try:
    import winsound
    _HAS_WINSOUND = True
except ImportError:
    _HAS_WINSOUND = False

_buzz_stop_event = threading.Event()
_buzz_thread = None

def _buzz_loop():
    """Continuously play a bee-buzz tone until _buzz_stop_event is set."""
    while not _buzz_stop_event.is_set():
        if _HAS_WINSOUND:
            winsound.Beep(220, 120)
        else:
            sys.stdout.write('\a')
            sys.stdout.flush()
            time.sleep(0.12)

def start_buzz():
    """Start the bee-buzz sound in a background thread (idempotent)."""
    global _buzz_thread
    if _buzz_thread is not None and _buzz_thread.is_alive():
        return
    _buzz_stop_event.clear()
    _buzz_thread = threading.Thread(target=_buzz_loop, daemon=True)
    _buzz_thread.start()

def stop_buzz():
    """Stop the bee-buzz sound."""
    _buzz_stop_event.set()


# ─── CONFIG — EDIT THESE AS NEEDED ───────────────────────────────────────────
# ⚠️  Replace with your actual Render backend URL
BACKEND_URL  = "https://elephant-tracker-jetson-nano.onrender.com/api/telemetry"
HEALTH_URL   = BACKEND_URL.replace("/api/telemetry", "/health")

MODEL_PATH   = "best.pt"          # Path to your trained YOLOv5 weights
CONFIDENCE   = 0.5                # Confidence threshold (0.0-1.0). Increase to reduce false positives
CAMERA_INDEX = 0                  # 0 = built-in webcam; try 1 if it doesn't open
GPS_LAT      = 12.2958            # Default GPS coordinates
GPS_LON      = 76.6394
SEND_EVERY_N = 2                  # Send every Nth frame
JPEG_QUALITY = 60                 # 0-100, lower = smaller payload
# ─────────────────────────────────────────────────────────────────────────────


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
    """POST a single frame + hazards to the backend."""
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


def parse_detections(results):
    """
    Convert YOLOv5 results to hazard list format.
    Only returns detections that pass the confidence threshold.
    """
    hazards = []
    
    # results.xyxy[0] contains detections: [x1, y1, x2, y2, confidence, class_id]
    detections = results.xyxy[0].cpu().numpy()
    names = results.names  # Class names dictionary
    
    for det in detections:
        x1, y1, x2, y2, conf, cls_id = det
        cls_id = int(cls_id)
        class_name = names.get(cls_id, f"class_{cls_id}")
        
        hazards.append({
            "class":      cls_id,
            "name":       class_name,
            "confidence": round(float(conf), 2),
            "xmin":       int(x1),
            "ymin":       int(y1),
            "xmax":       int(x2),
            "ymax":       int(y2)
        })
    
    return hazards


def main():
    print("=" * 60)
    print("  EleTrack AI — Real Detection (Laptop Webcam)")
    print("=" * 60)

    # Check backend URL
    if "YOUR-SERVICE-NAME" in BACKEND_URL or "your-backend" in BACKEND_URL:
        print("\n⚠️  WARNING: You may need to update BACKEND_URL in this file.")
        print("   Current:", BACKEND_URL)

    # Step 1: Load YOLOv5 model
    print(f"\n🤖 Loading YOLOv5 model from {MODEL_PATH}...")
    try:
        model = torch.hub.load('ultralytics/yolov5', 'custom',
                               path=MODEL_PATH, force_reload=False)
        model.conf = CONFIDENCE  # Set confidence threshold
        print(f"✅ Model loaded successfully!")
        print(f"   Confidence threshold: {CONFIDENCE}")
        print(f"   Classes: {model.names}")
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        print("\n   Make sure:")
        print("   1. PyTorch is installed: pip install torch torchvision")
        print("   2. best.pt exists in the current directory")
        sys.exit(1)

    # Step 2: Wake backend (optional, skip if testing locally)
    wake_backend(max_wait=30)

    # Step 3: Open webcam
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
    print("\n🚀 Real-time detection started!")
    print("   Press  Q  in the preview window to quit.\n")

    frame_count  = 0
    sent_count   = 0
    error_count  = 0
    detection_count = 0
    start_time   = time.time()

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("⚠️  Frame read failed — camera disconnected?")
                break

            frame_count += 1

            # ── Run REAL inference ──
            results = model(frame)
            hazards = parse_detections(results)
            
            # ── Buzz if elephant detected ──
            elephant_detected = any(h["name"].lower() == "elephant" for h in hazards)
            if elephant_detected:
                detection_count += 1
                start_buzz()
            else:
                stop_buzz()

            # ── Send to backend every Nth frame ──
            if frame_count % SEND_EVERY_N == 0:
                ok, status = send_frame(frame, hazards)
                if ok:
                    sent_count += 1
                else:
                    error_count += 1
                    print(f"⚠️  Send failed: {status}")

            # ── Draw preview with bounding boxes ──
            annotated = results.render()[0]  # Frame with YOLO's bounding boxes
            
            # Add status bar
            elapsed = time.time() - start_time
            bar = (f"Frame {frame_count} | Sent {sent_count} | "
                   f"Detections {detection_count} | {elapsed:.0f}s")
            cv2.rectangle(annotated, (0, 0), (frame_w, 28), (30, 30, 30), -1)
            cv2.putText(annotated, bar, (6, 19),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.46, (200, 200, 200), 1)

            # Detection indicator dot
            dot_color = (0, 0, 255) if elephant_detected else (0, 220, 0)
            cv2.circle(annotated, (frame_w - 16, 14), 7, dot_color, -1)

            cv2.imshow("EleTrack AI — Real Detection (Q to quit)", annotated)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    except KeyboardInterrupt:
        print("\n🛑 Interrupted.")

    finally:
        stop_buzz()
        cap.release()
        cv2.destroyAllWindows()
        elapsed = time.time() - start_time
        print(f"\n📊 Stats:")
        print(f"   Frames processed: {frame_count}")
        print(f"   Frames sent: {sent_count}")
        print(f"   Errors: {error_count}")
        print(f"   Total detections: {detection_count}")
        print(f"   Runtime: {elapsed:.1f}s")
        print("✅ Detection stopped.")


if __name__ == "__main__":
    main()
