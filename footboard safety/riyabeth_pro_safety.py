import cv2
import threading
import time
import requests
from datetime import datetime
from ultralytics import YOLO

# --- 1. SENSOR & CAMERA CONFIGURATION ---
PHONE_IP = "192.168.1.100:8080" 
VIDEO_URL = f"http://{PHONE_IP}/video"
SENSOR_URL = f"http://{PHONE_IP}/sensors.json"

# --- SERVER CONFIGURATION ---
SERVER_URL = "http://localhost:5000/api/safety"  # Change to your server IP if needed
DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1"  # Working driver ID

# Shared variable for speed (fetched from the phone)
current_speed_kmh = 0.0

# --- SERVER COMMUNICATION FUNCTIONS ---
def send_heartbeat():
    """Send heartbeat to server every 5 seconds"""
    while True:
        try:
            requests.post(f"{SERVER_URL}/heartbeat", json={"driver_id": DRIVER_ID}, timeout=2)
        except Exception:
            pass
        time.sleep(5)

def send_alert(alert_type, status, speed, confidence, message):
    """Send safety alert to server"""
    try:
        payload = {
            "driver_id": DRIVER_ID,
            "timestamp": datetime.now().isoformat(),
            "alert_type": alert_type,
            "status": status,
            "speed": round(speed, 2),
            "confidence": round(confidence, 3),
            "message": message
        }
        response = requests.post(f"{SERVER_URL}/alerts", json=payload, timeout=2)
        if response.status_code == 201:
            print(f"✓ Alert sent: {status}")
    except Exception as e:
        print(f"✗ Failed to send alert: {e}")

# --- MULTITHREADED SENSOR FETCHING ---
def update_sensors():
    global current_speed_kmh
    while True:
        try:
            # Fetch sensor data from IP Webcam app
            response = requests.get(SENSOR_URL, timeout=0.5)
            data = response.json()
            
            # Extract GPS speed (m/s) and convert to km/h (* 3.6)
            if 'gps_speed' in data:
                # Latest entry is at the end of the data list
                speed_ms = data['gps_speed']['data'][-1][1][0]
                current_speed_kmh = speed_ms * 3.6
        except Exception:
            # If GPS signal is lost or network fails
            current_speed_kmh = 0.0
        time.sleep(0.5) # Update speed every 500ms

# --- MULTITHREADED CAMERA CLASS ---
class FastCamera:
    def __init__(self, url):
        self.cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        self.ret, self.frame = self.cap.read()
        self.stopped = False
        threading.Thread(target=self.update, daemon=True).start()

    def update(self):
        while not self.stopped:
            self.ret, self.frame = self.cap.read()

    def get_frame(self):
        return self.frame

# --- INITIALIZATION ---
model = YOLO('best.pt')
model.fuse()

# Use GPU if available (CUDA), with half-precision for speed
import torch
DEVICE = 0 if torch.cuda.is_available() else 'cpu'
USE_HALF = torch.cuda.is_available()  # FP16 only works on GPU

# Start the Speed Tracker Thread
threading.Thread(target=update_sensors, daemon=True).start()

# Start the Heartbeat Thread (sends status to server)
threading.Thread(target=send_heartbeat, daemon=True).start()

cam = FastCamera(VIDEO_URL)
prev_time = 0
last_alert_time = 0  # Throttle alerts to avoid spam
ALERT_COOLDOWN = 2  # seconds between alerts

print(f"RiyaNeth System Connected to {PHONE_IP}")
print("Logic: ALERT if Speed > 5km/h AND Footboard Occupied.")

while True:
    frame = cam.get_frame()
    if frame is None:
        continue

    frame = cv2.resize(frame, (640, 480))
    
    # 4. FOOTBOARD DETECTION - Every frame, optimized for speed + accuracy
    results = model.predict(
        frame, 
        imgsz=480,          # Good balance of speed/accuracy
        verbose=False,
        device=DEVICE,
        half=USE_HALF,      # FP16 inference (faster on GPU)
        conf=0.25,          # Lower threshold = detect more
        iou=0.45            # NMS IoU threshold
    )
    
    footboard_occupied = False
    annotated_frame = frame.copy()

    for r in results:
        # Check if any detection belongs to 'Danger' or 'Warning' classes
        for box in r.boxes:
            class_id = int(box.cls[0])
            label = model.names[class_id]
            if label in ['Danger', 'Warning']: # Matches your training labels
                footboard_occupied = True
        
        annotated_frame = r.plot()

    # --- 5. SPEED-BASED SAFETY LOGIC ---
    # Unsafe condition: Movement > 5km/h while steps are occupied
    is_moving = current_speed_kmh > 5.0
    
    # Get highest confidence from detections
    max_confidence = 0.0
    detected_class = "Safe"
    for r in results:
        for box in r.boxes:
            conf = float(box.conf[0])
            if conf > max_confidence:
                max_confidence = conf
                detected_class = model.names[int(box.cls[0])]
    
    current_time = time.time()
    
    if footboard_occupied and is_moving:
        overlay_color = (0, 0, 255) # Bright Red
        status_msg = f"!!! CRITICAL DANGER: BUS MOVING ({current_speed_kmh:.1f} km/h) !!!"
        # Send critical alert to server (with cooldown)
        if current_time - last_alert_time > ALERT_COOLDOWN:
            send_alert(detected_class, "CRITICAL", current_speed_kmh, max_confidence, status_msg)
            last_alert_time = current_time
    elif footboard_occupied:
        overlay_color = (0, 255, 255) # Yellow
        status_msg = f"Warning: Footboard Occupied (Stationary)"
        # Send warning alert to server (with cooldown)
        if current_time - last_alert_time > ALERT_COOLDOWN:
            send_alert(detected_class, "WARNING", current_speed_kmh, max_confidence, status_msg)
            last_alert_time = current_time
    else:
        overlay_color = (0, 255, 0) # Green
        status_msg = f"Safe: Speed {current_speed_kmh:.1f} km/h"

    # --- UI RENDERING ---
    # Top Status Bar
    cv2.rectangle(annotated_frame, (0, 0), (640, 60), overlay_color, -1)
    cv2.putText(annotated_frame, status_msg, (15, 40), 
                cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2)

    # FPS Display
    curr_time = time.time()
    fps = 1 / (curr_time - prev_time)
    prev_time = curr_time
    cv2.putText(annotated_frame, f"FPS: {int(fps)}", (520, 100), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    cv2.imshow("RiyaNeth: AI + GPS Integrated Monitor", annotated_frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        cam.stopped = True
        break

cv2.destroyAllWindows()