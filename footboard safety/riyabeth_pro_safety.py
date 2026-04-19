import cv2
import threading
import time
import requests
from datetime import datetime
from ultralytics import YOLO

import argparse
from flask import Flask, request, jsonify

# --- DEFAULT CONFIGURATION ---
DEFAULT_SERVER_URL = "http://localhost:5000/api/safety"
DEFAULT_DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1"
DEFAULT_PHONE_IP = "10.60.136.249:8080" 
DEFAULT_ESP_IP = "192.168.1.106"  # IR Sensor ESP32 IP

parser = argparse.ArgumentParser(description="Footboard Safety AI + IR Failsafe")
parser.add_argument("--driver_id", type=str, default=DEFAULT_DRIVER_ID)
parser.add_argument("--server_url", type=str, default=DEFAULT_SERVER_URL)
parser.add_argument("--phone_ip", type=str, default=DEFAULT_PHONE_IP)

args = parser.parse_args()

SERVER_URL = args.server_url
DRIVER_ID = args.driver_id
PHONE_IP = args.phone_ip

VIDEO_URL = f"http://{PHONE_IP}/video"
SENSOR_URL = f"http://{PHONE_IP}/sensors.json"

# Webhook App for ESP32
app = Flask(__name__)

# Shared variables
current_speed_kmh = 0.0
ir_sensor_state = {"s1": False, "s2": False, "s3": False, "online": False}

# Use a session to prevent TCP socket exhaustion (TIME_WAIT)
http_session = requests.Session()

# --- SERVER COMMUNICATION FUNCTIONS ---
def send_heartbeat():
    """Send heartbeat to server every 5 seconds"""
    while True:
        try:
            http_session.post(f"{SERVER_URL}/heartbeat", json={"driver_id": DRIVER_ID}, timeout=2)
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
            "message": message,
            "detection_class": alert_type  # Passing source as detection class
        }
        response = http_session.post(f"{SERVER_URL}/alerts", json=payload, timeout=2)
        if response.status_code == 201:
            print(f"✓ Alert sent: {status}")
    except Exception as e:
        print(f"✗ Failed to send alert: {e}")

# --- WEBHOOK FOR ESP32 EVENTS ---
@app.route('/ir-webhook', methods=['POST'])
def receive_ir_event():
    global ir_sensor_state
    try:
        data = request.json
        if data is not None and "s1" in data:
            ir_sensor_state["s1"] = data.get("s1", False)
            ir_sensor_state["s2"] = data.get("s2", False)
            ir_sensor_state["s3"] = data.get("s3", False)
            ir_sensor_state["online"] = True
            
            risk_level = data.get("risk", 0)
            print(f"📡 [ESP32 PUSH] IR State | Risk: {risk_level} | S1:{ir_sensor_state['s1']} S2:{ir_sensor_state['s2']} S3:{ir_sensor_state['s3']}")
            return jsonify({"status": "success", "message": "IR State updated"}), 200
        else:
            return jsonify({"status": "error", "message": "Invalid payload"}), 400
    except Exception as e:
        print(f"❌ [ESP32 PUSH ERROR] {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

def run_webhook_server():
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR) # Suppress standard flask output
    app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False)

# --- MULTITHREADED SENSOR FETCHING (GPS) ---
def update_sensors():
    global current_speed_kmh
    while True:
        try:
            # Fetch sensor data from IP Webcam app
            response = http_session.get(SENSOR_URL, timeout=0.5)
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

# Start the Flask Webhook for ESP32 IR Sensor Pushes
threading.Thread(target=run_webhook_server, daemon=True).start()

# Start the Heartbeat Thread (sends status to server)
threading.Thread(target=send_heartbeat, daemon=True).start()

cam = FastCamera(VIDEO_URL)
prev_time = 0
last_alert_time = 0  # Throttle alerts to avoid spam
ALERT_COOLDOWN = 2  # seconds between alerts

print(f"RiyaNeth System Connected to Camera: {PHONE_IP}")
print(f"IR Sensor Webhook Listening on Port 5001")
print("Logic: ALERT if Speed > 5km/h AND (AI sees person OR IR is blocked).")

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
    
    # --- SENSOR FUSION LOGIC ---
    # 1. AI Detection
    yolo_occupied = False
    for r in results:
        # Check if any detection belongs to 'Danger' or 'Warning' classes
        for box in r.boxes:
            class_id = int(box.cls[0])
            label = model.names[class_id]
            if label in ['Danger', 'Warning']: # Matches your training labels
                yolo_occupied = True
        
        annotated_frame = r.plot()

    # 2. IR Sensor Hardware Detection
    ir_occupied = ir_sensor_state["s1"] or ir_sensor_state["s2"] or ir_sensor_state["s3"]
    ir_danger = ir_sensor_state["s3"] # Bottom step is immediate danger
    
    # Combined Safety State
    footboard_occupied = yolo_occupied or ir_occupied

    # Unsafe condition: Movement > 5km/h while steps are occupied (or step 3 is blocked)
    is_moving = current_speed_kmh > 5.0
    
    # Determine alert source identity for the dashboard
    detection_source = "Safe"
    max_confidence = 0.0
    
    if footboard_occupied:
        if yolo_occupied and ir_occupied:
            detection_source = "AI + IR Sensors"
            max_confidence = 1.0
        elif yolo_occupied:
            detection_source = "AI Vision Only"
            # Get highest confidence from AI
            for r in results:
                for box in r.boxes:
                    conf = float(box.conf[0])
                    if conf > max_confidence:
                        max_confidence = conf
        elif ir_occupied:
            detection_source = "IR Sensors Only"
            max_confidence = 1.0 # Hardware blocked
            
            # Map occupied step for specific messaging
            if ir_sensor_state["s3"]: detection_source += " (Bottom Step)"
            elif ir_sensor_state["s2"]: detection_source += " (Mid Step)"
            elif ir_sensor_state["s1"]: detection_source += " (Top Step)"
    
    current_time = time.time()

    # --- Build step-specific label for message (S1=Entry, S2=Mid, S3=Bottom) ---
    active_ir_steps = []
    if ir_sensor_state.get("s1"): active_ir_steps.append("S1-Entry")
    if ir_sensor_state.get("s2"): active_ir_steps.append("S2-Mid")
    if ir_sensor_state.get("s3"): active_ir_steps.append("S3-Bottom")
    step_label = ", ".join(active_ir_steps) if active_ir_steps else ""

    # Critical Alert: Moving while occupied OR someone is on the bottom step (Step 3)
    if (footboard_occupied and is_moving) or ir_danger:
        overlay_color = (0, 0, 255) # Bright Red

        if ir_danger and not is_moving:
            status_msg = (
                f"Child detected on bottom step ({step_label}). "
                f"Bus is stationary — remove child immediately."
            )
        else:
            step_info = f" [{step_label}]" if step_label else ""
            status_msg = (
                f"Footboard occupied{step_info} at {current_speed_kmh:.1f} km/h"
                f" via {detection_source}. Stop immediately."
            )

        # Send critical alert to server (with cooldown)
        if current_time - last_alert_time > ALERT_COOLDOWN:
            send_alert(detection_source, "CRITICAL", current_speed_kmh, max_confidence, status_msg)
            last_alert_time = current_time

    # Warning Alert: Occupied (Steps 1 or 2, or AI) but stationary
    elif footboard_occupied:
        overlay_color = (0, 255, 255) # Yellow
        step_info = f" [{step_label}]" if step_label else ""
        status_msg = (
            f"Footboard occupied{step_info} — bus stationary"
            f" via {detection_source}. Monitor situation."
        )
        # Send warning alert to server (with cooldown)
        if current_time - last_alert_time > ALERT_COOLDOWN:
            send_alert(detection_source, "WARNING", current_speed_kmh, max_confidence, status_msg)
            last_alert_time = current_time

    # Safe
    else:
        overlay_color = (0, 255, 0) # Green
        status_msg = f"Footboard clear. Speed: {current_speed_kmh:.1f} km/h."

    # --- UI RENDERING ---
    # Top Status Bar
    cv2.rectangle(annotated_frame, (0, 0), (640, 60), overlay_color, -1)
    cv2.putText(annotated_frame, status_msg, (15, 40), 
                cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2)

    # Hardware / AI Status Indicator
    cv2.putText(annotated_frame, f"IR: {'ON' if ir_sensor_state['online'] else 'OFF'}", (20, 100), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0) if ir_sensor_state['online'] else (0, 0, 255), 2)
    cv2.putText(annotated_frame, f"GPS Speed: {'Active' if current_speed_kmh > 0 else 'Waiting'}", (20, 130), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0) if current_speed_kmh > 0 else (0, 200, 255), 2)

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