"""
EleTrack AI Backend Integration Module
Drop this module into your Jetson project and import it in your detection script.

Usage:
    from rail_rakshak_uploader import TelemetryUploader

    uploader = TelemetryUploader(backend_url="https://your-backend.onrender.com/api/telemetry")

    # IMPORTANT: Wake the backend first (prevents Render cold-start drops)
    uploader.wake_backend()

    # In your inference loop — call send() on EVERY frame.
    # Frames are sent continuously whether or not an elephant is detected.
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        results = model(frame)
        uploader.send(frame, results)   # Always called — not just on detection
"""

import requests
import base64
import cv2
from datetime import datetime
from threading import Thread
import queue
import time


class TelemetryUploader:
    """
    Streams YOLOv5 frames to the EleTrack AI backend in real-time.

    Frames are sent CONTINUOUSLY — every frame regardless of whether
    an elephant is detected.  The backend and frontend will show the live
    video feed at all times; bounding boxes appear only when elephants exist.
    """

    def __init__(self,
                 backend_url="https://your-backend.onrender.com/api/telemetry",
                 gps_lat=28.6139,
                 gps_lon=77.2090,
                 send_interval=1,          # 1 = send EVERY frame (always-on stream)
                 jpeg_quality=70,          # Slightly lower quality for bandwidth
                 async_mode=True,          # Non-blocking by default
                 buffer_size=5):
        """
        Args:
            backend_url:    Full URL to /api/telemetry endpoint on Render.
            gps_lat:        GPS latitude (update this for your actual location).
            gps_lon:        GPS longitude.
            send_interval:  Send 1 out of every N frames.
                            Default 1 = send every frame (always streaming).
                            Set to 2 to halve bandwidth (send every 2nd frame).
            jpeg_quality:   JPEG compression quality (0-100).
                            70 is a good balance of quality vs. bandwidth.
            async_mode:     True = send in a background thread (doesn't slow
                            down the detection loop). Recommended for Jetson.
            buffer_size:    How many frames to queue in async mode.
                            Older frames are dropped when the queue is full.
        """
        self.backend_url = backend_url
        self.health_url = backend_url.replace('/api/telemetry', '/health')
        self.gps_lat = gps_lat
        self.gps_lon = gps_lon
        self.send_interval = send_interval
        self.jpeg_quality = jpeg_quality
        self.async_mode = async_mode
        self.frame_counter = 0
        self.sent_count = 0
        self.error_count = 0

        # For async mode
        if async_mode:
            self.queue = queue.Queue(maxsize=buffer_size)
            self.worker_thread = Thread(target=self._worker, daemon=True)
            self.worker_thread.start()

    # ------------------------------------------------------------------
    # PUBLIC: Wake the backend before starting the inference loop
    # ------------------------------------------------------------------

    def wake_backend(self, max_wait=45):
        """
        Ping the backend /health endpoint until it responds.

        Render free-tier services sleep after 15 min of inactivity.
        The first request takes up to ~30 seconds to wake the server.
        Call this ONCE at startup before your inference loop.

        Args:
            max_wait: Maximum seconds to wait for the server to wake up.

        Returns:
            True if the backend is awake, False if it timed out.
        """
        print(f"🔔 Waking backend at {self.health_url} ...")
        start = time.time()
        while time.time() - start < max_wait:
            try:
                r = requests.get(self.health_url, timeout=10)
                if r.status_code == 200:
                    elapsed = time.time() - start
                    print(f"✅ Backend awake! ({elapsed:.1f}s)")
                    return True
            except Exception:
                pass
            print(f"   ⏳ Still waking... ({int(time.time()-start)}s elapsed)")
            time.sleep(3)

        print(f"❌ Backend did not respond within {max_wait}s. Continuing anyway.")
        return False

    # ------------------------------------------------------------------
    # INTERNAL HELPERS
    # ------------------------------------------------------------------

    def _encode_frame(self, frame):
        """Convert OpenCV (BGR) frame to a Base64 data-URI string."""
        # Optionally resize to reduce payload size (comment out for full res)
        # frame = cv2.resize(frame, (640, 360))
        _, buffer = cv2.imencode(
            '.jpg', frame,
            [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
        )
        b64 = base64.b64encode(buffer).decode('utf-8')
        return "data:image/jpeg;base64," + b64   # Full data-URI — frontend uses this directly

    def _parse_detections(self, results):
        """Convert YOLOv5 results object to hazard list."""
        hazards = []
        if results is None:
            return hazards

        if hasattr(results, 'xyxy') and len(results.xyxy[0]) > 0:
            for det in results.xyxy[0]:
                x1, y1, x2, y2, conf, cls = det.tolist()
                hazards.append({
                    "class":      int(cls),
                    "name":       results.names[int(cls)],
                    "confidence": float(conf),
                    "xmin":       int(x1),
                    "ymin":       int(y1),
                    "xmax":       int(x2),
                    "ymax":       int(y2)
                })
        return hazards

    def _build_payload(self, frame, detections):
        """Build JSON payload. Always includes image_stream."""
        return {
            "timestamp":    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "gps_location": {
                "lat": self.gps_lat,
                "lon": self.gps_lon
            },
            "hazards":      detections,   # Empty list [] when no hazard — that's fine
            "image_stream": self._encode_frame(frame)
        }

    def _send_sync(self, payload):
        """Send telemetry payload synchronously. Timeout is 15s (survives Render cold-starts)."""
        try:
            response = requests.post(
                self.backend_url,
                json=payload,
                timeout=15,                # 15s timeout — Render cold starts can take ~10-30s
                headers={"Content-Type": "application/json"}
            )
            if response.status_code == 200:
                self.sent_count += 1
                return True
            else:
                print(f"⚠️  Backend returned {response.status_code}: {response.text[:80]}")
                self.error_count += 1
                return False

        except requests.exceptions.Timeout:
            print("⚠️  Request timeout — backend may be waking up (Render cold-start)")
            self.error_count += 1
            return False
        except requests.exceptions.ConnectionError as e:
            print(f"⚠️  Connection error: {e}")
            self.error_count += 1
            return False
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            self.error_count += 1
            return False

    def _worker(self):
        """Background thread — drains the frame queue and sends to backend."""
        while True:
            try:
                payload = self.queue.get(timeout=1)
                self._send_sync(payload)
                self.queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Worker error: {e}")

    # ------------------------------------------------------------------
    # PUBLIC: Send a frame (call this on EVERY frame in your loop)
    # ------------------------------------------------------------------

    def send(self, frame, yolov5_results=None):
        """
        Send the current camera frame + any detections to the backend.

        Call this on EVERY frame — not just when an elephant is detected.
        When there are no detections, 'hazards' is sent as an empty list []
        so the frontend still displays the live video feed.

        Args:
            frame:           OpenCV image (BGR) — the raw camera frame.
            yolov5_results:  YOLOv5 results from model(frame). Pass None
                             if you don't have detection results yet.

        Returns:
            True if the frame was queued/sent, False if skipped.
        """
        self.frame_counter += 1

        # Skip frames to control upload rate (default send_interval=1 → every frame)
        if self.frame_counter % self.send_interval != 0:
            return False

        try:
            detections = self._parse_detections(yolov5_results)
            payload = self._build_payload(frame, detections)

            if self.async_mode:
                try:
                    # Non-blocking: drop oldest if queue is full
                    self.queue.put_nowait(payload)
                    return True
                except queue.Full:
                    # Drop this frame rather than block the detection loop
                    return False
            else:
                return self._send_sync(payload)

        except Exception as e:
            print(f"❌ Error in send(): {e}")
            return False

    # ------------------------------------------------------------------
    # STATS
    # ------------------------------------------------------------------

    def get_stats(self):
        return {
            "frames_processed": self.frame_counter,
            "frames_sent":      self.sent_count,
            "errors":           self.error_count,
            "success_rate":     f"{100*self.sent_count/max(self.frame_counter,1):.1f}%"
        }

    def print_stats(self):
        s = self.get_stats()
        print(f"\n📊 Telemetry Stats:")
        print(f"   Frames captured : {s['frames_processed']}")
        print(f"   Frames sent     : {s['frames_sent']}")
        print(f"   Errors          : {s['errors']}")
        print(f"   Success rate    : {s['success_rate']}")


# ============================================================
# QUICK SETUP HELPER
# ============================================================

def create_uploader(backend_url="https://your-backend.onrender.com/api/telemetry",
                    gps_lat=28.6139, gps_lon=77.2090, **kwargs):
    """
    Quick setup function.

    Example:
        uploader = create_uploader("https://eletrack-ai-backend.onrender.com/api/telemetry")
        uploader.wake_backend()   # Always call this first!
    """
    return TelemetryUploader(backend_url=backend_url,
                             gps_lat=gps_lat,
                             gps_lon=gps_lon,
                             **kwargs)
