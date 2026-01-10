import cv2
import threading
import time
import torch
import requests
from ultralytics import YOLO
from datetime import datetime

# --- SERVER CONFIGURATION ---
SERVER_URL = "http://localhost:5000/api/driver-monitor"
DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1"  # Your working driver ID

# --- IP CAMERA CONFIGURATION ---
PHONE_IP = "192.168.1.100:8080"  # Ensure this matches your phone's IP
VIDEO_URL = f"http://{PHONE_IP}/video"

# --- GPU ACCELERATION ---
DEVICE = 0 if torch.cuda.is_available() else 'cpu'
USE_HALF = torch.cuda.is_available()
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

def send_alert(alert_type, severity, message, confidence=None, detection_class=None, sound=False):
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
            "message": message,
            "sound": sound
        }
        if confidence:
            payload["confidence"] = confidence
        if detection_class:
            payload["detection_class"] = detection_class
            
        response = requests.post(
            f"{SERVER_URL}/alerts",
            json=payload,
            timeout=3
        )
        if response.status_code == 201:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 🚨 Alert sent: {severity} - {alert_type}")
            return True
        else:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ⚠️ Alert failed: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ Alert error: {str(e)[:50]}")
        return False

# --- THREADED CAMERA CLASS (LOW LATENCY) ---
class FastCamera:
    def __init__(self, url):
        self.cap = cv2.VideoCapture(url)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        # Set lower capture resolution for speed
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.ret, self.frame = self.cap.read()
        self.stopped = False
        self.lock = threading.Lock()
        threading.Thread(target=self.update, daemon=True).start()

    def update(self):
        while not self.stopped:
            ret, frame = self.cap.read()
            if ret:
                with self.lock:
                    self.frame = frame

    def get_frame(self):
        with self.lock:
            return self.frame if self.frame is not None else None
    
    def release(self):
        self.stopped = True
        self.cap.release()

# --- LOAD YOLO MODEL ---
print("=" * 60)
print("DRIVER MONITORING SYSTEM V2.1")
print("=" * 60)

try:
    model = YOLO('Driver_monitering_V2.pt')
    model.fuse()
    print(f"✓ Model Loaded: Driver_monitering_V2.pt")
    print(f"✓ Classes detected by model: {model.names}")
except Exception as e:
    print(f"Error loading model: {e}")
    exit()

# --- START HEARTBEAT THREAD ---
heartbeat_thread = threading.Thread(target=send_heartbeat, daemon=True)
heartbeat_thread.start()
print("💓 Heartbeat thread started")
print(f"🌐 Server URL: {SERVER_URL}")

# --- ALERT TRACKING ---
alert_frames = 0
ALERT_THRESHOLD = 10  # Increased slightly for stability
prev_time = time.time()

# --- CONNECT TO CAMERA ---
print(f"Connecting to IP Camera: {PHONE_IP}")
cam = FastCamera(VIDEO_URL)
time.sleep(2)

print("\nSystem Ready! Press 'Q' to quit.")
print("-" * 60)

while True:
    frame = cam.get_frame()
    if frame is None:
        continue
    
    frame = cv2.resize(frame, (640, 480))
    
    # --- YOLO DETECTION (OPTIMIZED FOR SPEED) ---
    results = model.predict(
        frame,
        imgsz=320,          # Smaller = much faster
        conf=0.15,          # Very low base threshold
        iou=0.5,
        device=DEVICE,
        half=USE_HALF,
        verbose=False,
        max_det=5           # Limit detections for speed
    )
    
    # Extract detections into a dictionary for clean logic processing
    # format: {'class_name': confidence_score}
    current_detections = {}
    if len(results[0].boxes) > 0:
        for box in results[0].boxes:
            cls_id = int(box.cls[0])
            label = model.names[cls_id]
            conf = float(box.conf[0])
            
            # Different thresholds per class
            if label == 'phone_use' and conf >= 0.15:
                current_detections[label] = conf
            elif conf >= 0.25:
                current_detections[label] = conf

    # --- PRIORITY LOGIC SYSTEM ---
    # Default State
    status_text = "DRIVER ALERT ✓"
    status_color = (0, 255, 0) # Green
    is_danger = False
    is_warning = False

    # 1. Critical Danger (Priority 1) - Drowsy / Eyes Closed
    if 'Drowsy' in current_detections or 'eyes closed' in current_detections:
        status_text = "⚠️ DROWSY - WAKE UP!"
        status_color = (0, 0, 255) # Red
        is_danger = True
        alert_frames += 2 # Accumulate alert faster
        
        # Send alert to server
        conf = current_detections.get('Drowsy') or current_detections.get('eyes closed', 0)
        send_alert(
            alert_type="drowsy",
            severity="DANGER",
            message="Driver appears drowsy! Wake up immediately!",
            confidence=conf,
            detection_class="Drowsy/Eyes Closed",
            sound=True
        )
        
    # 2. High Risk (Priority 2) - Phone Use
    elif 'phone_use' in current_detections:
        status_text = "⚠️ PHONE DETECTED!"
        status_color = (0, 0, 255) # Red
        is_danger = True
        alert_frames += 1
        
        # Send alert to server
        send_alert(
            alert_type="phone_use",
            severity="DANGER",
            message="Phone usage detected! Put the phone down!",
            confidence=current_detections['phone_use'],
            detection_class="Phone Use",
            sound=True
        )

    # 3. Distraction (Priority 3) - Looking Away
    elif 'looking_away' in current_detections:
        status_text = "⚠️ EYES ON ROAD!"
        status_color = (0, 0, 255) # Red
        is_danger = True
        alert_frames += 1
        
        # Send alert to server
        send_alert(
            alert_type="looking_away",
            severity="DANGER",
            message="Driver looking away from road! Eyes on road!",
            confidence=current_detections['looking_away'],
            detection_class="Looking Away",
            sound=True
        )

    # 4. Warnings (Priority 4) - Yawning / Eyes Narrowed
    elif 'yawning' in current_detections or 'eyes_narrowed' in current_detections:
        status_text = "😴 YAWNING - TAKE A BREAK?"
        status_color = (0, 165, 255) # Orange
        is_warning = True
        # We don't increment alert_frames for yawning unless you want it to trigger the Red alarm
        
        # Send alert to server
        if 'yawning' in current_detections:
            send_alert(
                alert_type="yawning",
                severity="WARNING",
                message="Driver yawning detected. Consider taking a break!",
                confidence=current_detections['yawning'],
                detection_class="Yawning",
                sound=False
            )
        elif 'eyes_narrowed' in current_detections:
            send_alert(
                alert_type="eyes_narrowed",
                severity="WARNING",
                message="Driver eyes narrowing - signs of fatigue detected.",
                confidence=current_detections['eyes_narrowed'],
                detection_class="Eyes Narrowed",
                sound=False
            )

    # 5. Safe State (Reset)
    else:
        alert_frames = max(0, alert_frames - 1)

    # --- UI RENDERING ---
    annotated_frame = results[0].plot()

    # Determine what to actually display based on the frame buffer
    display_color = status_color if (alert_frames >= ALERT_THRESHOLD or is_warning) else (0, 255, 0)
    display_text = status_text if (alert_frames >= ALERT_THRESHOLD or is_warning) else "DRIVER ALERT ✓"

    # Top status bar
    cv2.rectangle(annotated_frame, (0, 0), (640, 60), display_color, -1)
    cv2.putText(annotated_frame, display_text, (10, 40), 
                cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2)
    
    # Show active detections list
    if current_detections:
        det_str = " | ".join([f"{k}: {int(v*100)}%" for k, v in current_detections.items()])
        cv2.putText(annotated_frame, det_str, (10, 90), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    # Alert counter and FPS
    curr_time = time.time()
    fps = 1 / (curr_time - prev_time + 0.001)
    prev_time = curr_time
    cv2.putText(annotated_frame, f"Alert Buffer: {alert_frames}/{ALERT_THRESHOLD}", (10, 115), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)
    cv2.putText(annotated_frame, f"FPS: {int(fps)}", (550, 90), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
    
    cv2.imshow("Driver Monitoring V2.1", annotated_frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cam.release()
cv2.destroyAllWindows()
print("\nSystem Stopped.")