import cv2
import threading
import torch
import requests
import time
from ultralytics import YOLO
from datetime import datetime

# --- SERVER CONFIGURATION ---
SERVER_URL = "http://localhost:5000/api/window-safety"
DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1"  # Your working driver ID

# --- IP CAMERA CONFIGURATION ---
PHONE_IP = "192.168.1.100:8080"  # Change to your phone's IP
VIDEO_URL = f"http://{PHONE_IP}/video"

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