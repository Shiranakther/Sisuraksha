import cv2
import threading
import torch
import requests
import time
import os
import sys
from pathlib import Path
from ultralytics import YOLO
from datetime import datetime

import argparse


def _attach_repo_root():
    this_file = Path(__file__).resolve()
    for parent in this_file.parents:
        if (parent / "shared_network_config.py").exists():
            root_path = str(parent)
            if root_path not in sys.path:
                sys.path.append(root_path)
            return


_attach_repo_root()

from shared_network_config import build_phone_video_url, load_network_config

NETWORK_CONFIG = load_network_config()

# ---------------------------------------------------------------------------
# SOUND ALERT — plays alert.wav (non-blocking) on each detection
# ---------------------------------------------------------------------------
_SOUND_PATH = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 '..', 'driver_app', 'assets', 'sounds', 'alert.wav')
)
_last_sound_time: dict = {}
SOUND_COOLDOWN = 3  # seconds between sounds for the same detection class

def play_alert_sound(detection_class: str = "default") -> None:
    """Play alert.wav in a background thread (non-blocking). Per-class cooldown."""
    now = time.time()
    if now - _last_sound_time.get(detection_class, 0) < SOUND_COOLDOWN:
        return
    _last_sound_time[detection_class] = now

    def _play():
        try:
            if sys.platform == "win32":
                import winsound
                winsound.PlaySound(
                    _SOUND_PATH,
                    winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NOWAIT
                )
            else:
                import subprocess
                player = "afplay" if sys.platform == "darwin" else "aplay"
                subprocess.Popen([player, _SOUND_PATH],
                                 stdout=subprocess.DEVNULL,
                                 stderr=subprocess.DEVNULL)
        except Exception as e:
            print(f"[Sound] Could not play alert: {e}")

    threading.Thread(target=_play, daemon=True).start()
# ---------------------------------------------------------------------------

# --- DEFAULT CONFIGURATION ---
DEFAULT_SERVER_URL = NETWORK_CONFIG["WINDOW_SAFETY_SERVER_URL"]
DEFAULT_DRIVER_ID = NETWORK_CONFIG["DRIVER_ID"]
DEFAULT_PHONE_IP = NETWORK_CONFIG["PHONE_IP"]

# Initialize parser
parser = argparse.ArgumentParser(description="Window Safety Monitoring System")
parser.add_argument("--driver_id", type=str, default=DEFAULT_DRIVER_ID, help="Driver UUID")
parser.add_argument("--server_url", type=str, default=DEFAULT_SERVER_URL, help="Backend API URL for window safety")
parser.add_argument("--phone_ip", type=str, default=DEFAULT_PHONE_IP, help="IP address of the phone camera (e.g. 192.168.1.103:8080)")

args = parser.parse_args()

SERVER_URL = args.server_url
DRIVER_ID = args.driver_id
PHONE_IP = args.phone_ip
VIDEO_URL = build_phone_video_url(PHONE_IP)

# --- GPU ACCELERATION ---
DEVICE = 0 if torch.cuda.is_available() else 'cpu'
USE_HALF = torch.cuda.is_available()  # FP16 only on GPU
print(f"Using device: {'GPU (CUDA)' if torch.cuda.is_available() else 'CPU'}")

# --- ALERT TRACKING ---
last_alert_time = {}
ALERT_COOLDOWN = 5  # Seconds between alerts for same detection type

# --- SERVER COMMUNICATION ---
def send_heartbeat():
    """Send heartbeat every 5 seconds to server"""
    while True:
        try:
            response = requests.post(
                f"{SERVER_URL}/heartbeat",
                json={"driver_id": DRIVER_ID},
                timeout=3
            )
            if response.status_code == 200:
                data = response.json()
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ❤️ Heartbeat sent - System {'enabled' if data.get('system_enabled') else 'disabled'}")
            else:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️ Heartbeat failed: {response.status_code}")
        except requests.exceptions.RequestException as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ Heartbeat error: {str(e)[:50]}")
        time.sleep(5)

def send_alert(alert_type, severity, message, confidence=None):
    """Send alert to server with cooldown"""
    global last_alert_time
    current_time = time.time()
    
    # Check cooldown
    alert_key = f"{alert_type}_{severity}"
    if alert_key in last_alert_time:
        if current_time - last_alert_time[alert_key] < ALERT_COOLDOWN:
            return False
    
    last_alert_time[alert_key] = current_time
    
    try:
        payload = {
            "driver_id": DRIVER_ID,
            "alert_type": alert_type,
            "severity": severity,
            "status": severity,
            "message": message
        }
        if confidence:
            payload["confidence"] = confidence
            
        response = requests.post(
            f"{SERVER_URL}/alerts",
            json=payload,
            timeout=3
        )
        if response.status_code == 201:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 🚨 Alert sent: {severity} - {message}")
            return True
        else:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️ Alert failed: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ Alert error: {str(e)[:50]}")
        return False

# --- THREADED CAMERA CLASS (reduces latency) ---
class FastCamera:
    def __init__(self, url):
        self.cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.ret, self.frame = self.cap.read()
        self.stopped = False
        threading.Thread(target=self.update, daemon=True).start()

    def update(self):
        while not self.stopped:
            self.ret, self.frame = self.cap.read()

    def get_frame(self):
        return self.frame
    
    def release(self):
        self.stopped = True
        self.cap.release()

# --- START HEARTBEAT THREAD ---
heartbeat_thread = threading.Thread(target=send_heartbeat, daemon=True)
heartbeat_thread.start()
print("💓 Heartbeat thread started")

# --- INITIALIZE MODEL ---
model = YOLO('kasun_model.pt')
model.fuse()  # Fuse layers for faster inference

# --- CONNECT TO CAMERA ---
print(f"Connecting to IP Camera: {PHONE_IP}...")
cam = FastCamera(VIDEO_URL)
print(f"✅ Connected to IP Camera: {PHONE_IP}")
print(f"📋 Model classes: {model.names}")
print(f"🌐 Server URL: {SERVER_URL}")
print("-" * 50)

# --- MAIN DETECTION LOOP ---
while True:
    frame = cam.get_frame()
    if frame is None:
        continue
    
    # Resize frame for faster processing
    frame = cv2.resize(frame, (640, 480))

    # Run YOLOv8 detection - OPTIMIZED for low latency
    results = model.predict(
        frame, 
        imgsz=320,         # Smaller = much faster
        conf=0.4,          # Confidence threshold
        device=DEVICE,     # GPU if available
        half=USE_HALF,     # FP16 for speed
        verbose=False      # No console spam
    )

    # Check if any objects were detected
    for r in results:
        if len(r.boxes) > 0:
            # Iterate through each detection
            for box in r.boxes:
                cls_id = int(box.cls[0])
                confidence = float(box.conf[0])
                class_name = model.names[cls_id]
                
                # Determine severity and alert_type based on detection
                # head = DANGER, hand = WARNING, body = WARNING
                if "head" in class_name.lower():
                    alert_type = "head_detected"
                    severity = "DANGER"
                    message = f"Head detected outside window! Confidence: {confidence:.2%}"
                elif "hand" in class_name.lower():
                    alert_type = "hand_detected"
                    severity = "WARNING"
                    message = f"Hand detected outside window! Confidence: {confidence:.2%}"
                elif "body" in class_name.lower():
                    alert_type = "body_detected"
                    severity = "WARNING"
                    message = f"Body detected outside window! Confidence: {confidence:.2%}"
                else:
                    alert_type = "unknown_detected"
                    severity = "WARNING"
                    message = f"{class_name} detected! Confidence: {confidence:.2%}"
                
                # Send alert to server with specific detection type
                send_alert(
                    alert_type=alert_type,
                    severity=severity,
                    message=message,
                    confidence=confidence
                )
            
            # Draw warning text on frame
            cv2.putText(frame, "!! SAFETY VIOLATION !!", (50, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 3)

    # Show the frame with YOLO boxes
    annotated_frame = results[0].plot()
    cv2.imshow("Window Safety System", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        print("\n🛑 Shutting down...")
        break

cam.release()
cv2.destroyAllWindows()
print("✅ Window Safety System stopped")