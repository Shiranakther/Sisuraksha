import cv2
import threading
import time
import requests
import numpy as np
import queue
from dataclasses import dataclass, field
from datetime import datetime
from ultralytics import YOLO

import argparse
import sys
from pathlib import Path
from flask import Flask, request, jsonify


def _attach_repo_root():
    this_file = Path(__file__).resolve()
    for parent in this_file.parents:
        if (parent / "shared_network_config.py").exists():
            root_path = str(parent)
            if root_path not in sys.path:
                sys.path.append(root_path)
            return


_attach_repo_root()

from shared_network_config import (
    build_esp32cam_stream_url,
    build_phone_sensor_url,
    build_phone_video_url,
    load_network_config,
)

NETWORK_CONFIG = load_network_config()

# --- DEFAULT CONFIGURATION ---
DEFAULT_SERVER_URL = NETWORK_CONFIG["FOOTBOARD_SERVER_URL"]
DEFAULT_DRIVER_ID = NETWORK_CONFIG["DRIVER_ID"]
DEFAULT_PHONE_IP = NETWORK_CONFIG["PHONE_IP"]
DEFAULT_ESP32_CAM_IP = NETWORK_CONFIG["ESP32_CAM_IP"]
DEFAULT_CAMERA_SOURCE = NETWORK_CONFIG["FOOTBOARD_CAMERA_SOURCE"]
DEFAULT_ESP_IP = NETWORK_CONFIG["ESP32_IR_IP"]
DEFAULT_WEBHOOK_PORT = int(NETWORK_CONFIG["FOOTBOARD_WEBHOOK_PORT"])

parser = argparse.ArgumentParser(description="Footboard Safety AI + IR Failsafe")
parser.add_argument("--driver_id", type=str, default=DEFAULT_DRIVER_ID)
parser.add_argument("--server_url", type=str, default=DEFAULT_SERVER_URL)
parser.add_argument("--phone_ip", type=str, default=DEFAULT_PHONE_IP)
parser.add_argument("--esp32_cam_ip", type=str, default=DEFAULT_ESP32_CAM_IP)
parser.add_argument("--camera_source", choices=["phone", "esp32cam"], default=DEFAULT_CAMERA_SOURCE)
parser.add_argument("--camera_url", type=str, default="")
parser.add_argument("--esp_ip", type=str, default=DEFAULT_ESP_IP)
parser.add_argument("--webhook_port", type=int, default=DEFAULT_WEBHOOK_PORT)
parser.add_argument("--display_width", type=int, default=640)
parser.add_argument("--display_height", type=int, default=480)
parser.add_argument("--ai_imgsz", type=int, default=416)
parser.add_argument("--ai_conf", type=float, default=0.25)
parser.add_argument("--ai_interval", type=float, default=0.12, help="Minimum seconds between YOLO inference passes")
parser.add_argument("--disable_ai", action="store_true", help="Start with AI vision detection disabled")
parser.add_argument("--disable_ir", action="store_true", help="Start with IR footboard detection disabled")

args = parser.parse_args()

SERVER_URL = args.server_url
DRIVER_ID = args.driver_id
PHONE_IP = args.phone_ip
ESP32_CAM_IP = args.esp32_cam_ip
CAMERA_SOURCE = args.camera_source
CAMERA_URL = args.camera_url.strip()
ESP_IP = args.esp_ip
WEBHOOK_PORT = args.webhook_port
DISPLAY_SIZE = (args.display_width, args.display_height)
AI_IMGSZ = args.ai_imgsz
AI_CONF = args.ai_conf
AI_INTERVAL = max(0.03, args.ai_interval)
AI_ENABLED = not args.disable_ai
IR_ENABLED = not args.disable_ir
detection_mode_lock = threading.Lock()

if CAMERA_URL:
    VIDEO_URL = CAMERA_URL
elif CAMERA_SOURCE == "esp32cam":
    VIDEO_URL = build_esp32cam_stream_url(ESP32_CAM_IP)
else:
    VIDEO_URL = build_phone_video_url(PHONE_IP)
SENSOR_URL = build_phone_sensor_url(PHONE_IP)

# Webhook App for ESP32
app = Flask(__name__)

# Shared variables
current_speed_kmh = 0.0
ir_sensor_state = {"s1": False, "s2": False, "s3": False, "online": False}
ir_state_lock = threading.Lock()
speed_sensor_state = {
    "speed_kmh": 0.0,
    "rpm": 0.0,
    "pulses": 0,
    "pulses_per_sec": 0.0,
    "moving": False,
    "online": False,
    "updated_at": 0.0,
}
speed_state_lock = threading.Lock()
last_ir_webhook_state = (False, False, False)
last_ir_alert_time = 0.0
IR_WEBHOOK_ALERT_COOLDOWN = 0.8
SPEED_SENSOR_STALE_SECONDS = 6.0
ESP32_DATA_POLL_INTERVAL = 0.5
ESP32_DATA_MAX_MISSES = 8
PHONE_GPS_FALLBACK_AFTER_SECONDS = 20.0

# Use a session to prevent TCP socket exhaustion (TIME_WAIT)
http_session = requests.Session()
alert_queue = queue.Queue(maxsize=100)


@dataclass
class AiState:
    occupied: bool = False
    max_confidence: float = 0.0
    boxes: list = field(default_factory=list)
    fps: float = 0.0
    updated_at: float = 0.0


ai_state = AiState()
ai_state_lock = threading.Lock()


def parse_bool(value):
    """Accept booleans from JSON, strings, or numeric ESP32 payloads."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "occupied", "blocked"}
    return False


def parse_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def build_esp32_data_url(esp_ip):
    esp_ip = (esp_ip or "").strip()
    if not esp_ip:
        return ""
    if esp_ip.startswith(("http://", "https://")):
        return f"{esp_ip.rstrip('/')}/data"
    return f"http://{esp_ip}/data"


def get_step_label(s1, s2, s3):
    if s3:
        return "Bottom Step"
    if s2:
        return "Mid Step"
    if s1:
        return "Top Step"
    return "Clear"

# --- SERVER COMMUNICATION FUNCTIONS ---
def send_heartbeat():
    """Send heartbeat to server every 5 seconds"""
    while True:
        try:
            http_session.post(f"{SERVER_URL}/heartbeat", json={"driver_id": DRIVER_ID}, timeout=2)
        except Exception:
            pass
        time.sleep(5)


def get_detection_modes():
    with detection_mode_lock:
        return AI_ENABLED, IR_ENABLED


def refresh_detection_modes():
    """Pull AI/IR mode switches from the mobile app/server while running."""
    global AI_ENABLED, IR_ENABLED

    while True:
        try:
            response = http_session.get(
                f"{SERVER_URL}/modes",
                params={"driver_id": DRIVER_ID},
                timeout=2
            )
            if response.status_code == 200:
                data = response.json()
                next_ai_enabled = parse_bool(data.get("aiEnabled", True))
                next_ir_enabled = parse_bool(data.get("irEnabled", True))

                with detection_mode_lock:
                    changed = next_ai_enabled != AI_ENABLED or next_ir_enabled != IR_ENABLED
                    AI_ENABLED = next_ai_enabled
                    IR_ENABLED = next_ir_enabled

                if changed:
                    print(
                        f"[MODES] AI={'ON' if next_ai_enabled else 'OFF'} | "
                        f"IR={'ON' if next_ir_enabled else 'OFF'}"
                    )

                if not next_ai_enabled:
                    with ai_state_lock:
                        ai_state.occupied = False
                        ai_state.max_confidence = 0.0
                        ai_state.boxes = []
        except Exception:
            pass

        time.sleep(1.0)


def alert_sender_worker():
    """Persist alerts in the background so DB/network latency cannot stall detection."""
    while True:
        payload = alert_queue.get()
        try:
            response = http_session.post(f"{SERVER_URL}/alerts", json=payload, timeout=2)
            if response.status_code == 201:
                print(f"[OK] Alert saved: {payload['status']}")
            else:
                print(f"[WARN] Alert save returned {response.status_code}")
        except Exception as e:
            print(f"[ERROR] Failed to save alert: {e}")
        finally:
            alert_queue.task_done()


def send_alert(alert_type, status, speed, confidence, message):
    """Queue safety alert for backend/database storage."""
    payload = {
        "driver_id": DRIVER_ID,
        "timestamp": datetime.now().isoformat(),
        "alert_type": alert_type,
        "status": status,
        "speed": round(speed, 2),
        "confidence": round(confidence, 3),
        "message": message,
        "sound": status in {"CRITICAL", "WARNING"},
        "detection_class": alert_type
    }

    try:
        alert_queue.put_nowait(payload)
        print(f"[QUEUE] Alert queued: {status}")
    except queue.Full:
        try:
            alert_queue.get_nowait()
            alert_queue.task_done()
            alert_queue.put_nowait(payload)
            print(f"[QUEUE] Alert queue full - dropped oldest, queued: {status}")
        except queue.Empty:
            pass

def send_ir_webhook_alert(s1, s2, s3, risk_level):
    """Forward ESP32 IR changes immediately, even if the camera stream is unavailable."""
    _, ir_enabled = get_detection_modes()
    if not ir_enabled:
        return

    step_label = get_step_label(s1, s2, s3)
    ir_occupied = s1 or s2 or s3

    if not ir_occupied:
        send_alert(
            "IR Sensors Clear",
            "SAFE",
            current_speed_kmh,
            0.0,
            f"Footboard IR sensors clear. Speed: {current_speed_kmh:.1f} km/h."
        )
        return

    now = time.time()
    with speed_state_lock:
        hall_speed_fresh = (
            speed_sensor_state["online"]
            and now - speed_sensor_state["updated_at"] <= SPEED_SENSOR_STALE_SECONDS
        )
        hall_moving = hall_speed_fresh and speed_sensor_state["moving"]

    is_moving = hall_moving if hall_speed_fresh else current_speed_kmh > 5.0
    status = "CRITICAL" if s3 or is_moving or risk_level >= 3 else "WARNING"
    alert_type = f"IR Sensors Only ({step_label})"
    message = (
        f"Footboard {step_label.lower()} occupied from ESP32 IR sensor. "
        f"Speed: {current_speed_kmh:.1f} km/h."
    )
    send_alert(alert_type, status, current_speed_kmh, 1.0, message)


# --- WEBHOOK FOR ESP32 EVENTS ---
@app.route('/ir-webhook', methods=['POST'])
def receive_ir_event():
    global ir_sensor_state, last_ir_webhook_state, last_ir_alert_time
    try:
        data = request.get_json(silent=True)
        if data is not None and "s1" in data:
            s1 = parse_bool(data.get("s1", False))
            s2 = parse_bool(data.get("s2", False))
            s3 = parse_bool(data.get("s3", False))
            risk_level = int(data.get("risk", 3 if s3 else 2 if s2 else 1 if s1 else 0) or 0)

            with ir_state_lock:
                ir_sensor_state["s1"] = s1
                ir_sensor_state["s2"] = s2
                ir_sensor_state["s3"] = s3
                ir_sensor_state["online"] = True

            current_state = (s1, s2, s3)
            current_time = time.time()
            if current_state != last_ir_webhook_state and current_time - last_ir_alert_time > IR_WEBHOOK_ALERT_COOLDOWN:
                send_ir_webhook_alert(s1, s2, s3, risk_level)
                last_ir_webhook_state = current_state
                last_ir_alert_time = current_time
            print(f"[ESP32 PUSH] IR State | Risk: {risk_level} | S1:{s1} S2:{s2} S3:{s3}")
            return jsonify({"status": "success", "message": "IR State updated"}), 200
        else:
            return jsonify({"status": "error", "message": "Invalid payload"}), 400
    except Exception as e:
        print(f"[ESP32 PUSH ERROR] {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/speed-webhook', methods=['POST'])
def receive_speed_event():
    global current_speed_kmh
    try:
        data = request.get_json(silent=True)
        if data is not None and "speed_kmh" in data:
            speed_kmh = max(0.0, parse_float(data.get("speed_kmh", 0.0)))
            rpm = max(0.0, parse_float(data.get("rpm", 0.0)))
            pulses = max(0, int(parse_float(data.get("pulses", 0), 0)))
            pulses_per_sec = max(0.0, parse_float(data.get("pulses_per_sec", 0.0)))
            moving = parse_bool(data.get("moving", speed_kmh > 0.1))

            current_speed_kmh = speed_kmh
            with speed_state_lock:
                speed_sensor_state["speed_kmh"] = speed_kmh
                speed_sensor_state["rpm"] = rpm
                speed_sensor_state["pulses"] = pulses
                speed_sensor_state["pulses_per_sec"] = pulses_per_sec
                speed_sensor_state["moving"] = moving
                speed_sensor_state["online"] = True
                speed_sensor_state["updated_at"] = time.time()

            print(
                f"[ESP32 PUSH] Speed | {speed_kmh:.2f} km/h | "
                f"RPM:{rpm:.1f} | Moving:{moving}"
            )
            return jsonify({"status": "success", "message": "Speed updated"}), 200
        else:
            return jsonify({"status": "error", "message": "Invalid payload"}), 400
    except Exception as e:
        print(f"[ESP32 SPEED PUSH ERROR] {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


def run_webhook_server():
    import logging
    log = logging.getLogger('werkzeug')
    log.setLevel(logging.ERROR) # Suppress standard flask output
    app.run(host='0.0.0.0', port=WEBHOOK_PORT, debug=False, use_reloader=False)


def update_from_esp32_dashboard():
    """Fallback live state path: poll ESP32 /data if webhook pushes are missed."""
    global current_speed_kmh

    esp32_data_url = build_esp32_data_url(ESP_IP)
    if not esp32_data_url:
        return

    misses = 0
    while True:
        try:
            response = http_session.get(esp32_data_url, timeout=0.8)
            response.raise_for_status()
            data = response.json()

            s1 = parse_bool(data.get("s1", False))
            s2 = parse_bool(data.get("s2", False))
            s3 = parse_bool(data.get("s3", False))
            speed_kmh = max(0.0, parse_float(data.get("speed_kmh", current_speed_kmh)))
            rpm = max(0.0, parse_float(data.get("rpm", 0.0)))
            pulses = max(0, int(parse_float(data.get("pulses", 0), 0)))
            pulses_per_sec = max(0.0, parse_float(data.get("pulses_per_sec", 0.0)))
            moving = parse_bool(data.get("moving", speed_kmh > 0.1))
            now = time.time()

            with ir_state_lock:
                ir_sensor_state["s1"] = s1
                ir_sensor_state["s2"] = s2
                ir_sensor_state["s3"] = s3
                ir_sensor_state["online"] = True

            current_speed_kmh = speed_kmh
            with speed_state_lock:
                speed_sensor_state["speed_kmh"] = speed_kmh
                speed_sensor_state["rpm"] = rpm
                speed_sensor_state["pulses"] = pulses
                speed_sensor_state["pulses_per_sec"] = pulses_per_sec
                speed_sensor_state["moving"] = moving
                speed_sensor_state["online"] = True
                speed_sensor_state["updated_at"] = now

            misses = 0
        except Exception:
            misses += 1
            if misses >= ESP32_DATA_MAX_MISSES:
                with ir_state_lock:
                    ir_sensor_state["online"] = False
                with speed_state_lock:
                    speed_sensor_state["online"] = False

        time.sleep(ESP32_DATA_POLL_INTERVAL)


# --- MULTITHREADED SENSOR FETCHING (PHONE GPS FALLBACK) ---
def update_sensors():
    global current_speed_kmh
    while True:
        now = time.time()
        with speed_state_lock:
            last_esp32_speed_at = speed_sensor_state["updated_at"]
            esp32_speed_seen = last_esp32_speed_at > 0
            esp32_speed_recent = esp32_speed_seen and now - last_esp32_speed_at <= PHONE_GPS_FALLBACK_AFTER_SECONDS

        if esp32_speed_recent:
            time.sleep(0.5)
            continue

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
        self.url = url
        self.use_mjpeg_parser = "/stream" in url or CAMERA_SOURCE == "esp32cam"
        self.cap = None
        self.ret = False
        self.frame = None
        self.frame_id = 0
        self.last_frame_time = 0.0
        self.capture_fps = 0.0
        self.frame_lock = threading.Lock()
        self.stopped = False
        if not self.use_mjpeg_parser:
            self.open_capture()
        threading.Thread(target=self.update, daemon=True).start()

    def open_capture(self):
        if self.cap is not None:
            self.cap.release()

        self.cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
            self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 3000)
        if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
            self.cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 1000)
        self.ret, first_frame = self.cap.read()
        if self.ret and first_frame is not None:
            with self.frame_lock:
                self.frame = first_frame
                self.frame_id += 1
                self.last_frame_time = time.time()

    def store_frame(self, frame):
        now = time.time()
        with self.frame_lock:
            self.ret = True
            self.frame = frame
            self.frame_id += 1
            if self.last_frame_time > 0:
                instant_fps = 1.0 / max(now - self.last_frame_time, 0.001)
                self.capture_fps = (self.capture_fps * 0.85) + (instant_fps * 0.15)
            self.last_frame_time = now

    def update(self):
        if self.use_mjpeg_parser:
            self.update_mjpeg_stream()
            return

        while not self.stopped:
            ret, frame = self.cap.read()
            now = time.time()
            if ret and frame is not None:
                self.store_frame(frame)
            else:
                self.ret = ret
                if now - self.last_frame_time > 2.0:
                    print("[Camera] Stream stale - reconnecting...")
                    self.open_capture()
                time.sleep(0.03)

    def update_mjpeg_stream(self):
        session = requests.Session()

        while not self.stopped:
            try:
                print(f"[Camera] Opening MJPEG stream: {self.url}")
                response = session.get(self.url, stream=True, timeout=(2, 1.5))
                response.raise_for_status()

                buffer = bytearray()
                last_chunk_time = time.time()

                for chunk in response.iter_content(chunk_size=2048):
                    if self.stopped:
                        break
                    if not chunk:
                        if time.time() - last_chunk_time > 1.5:
                            break
                        continue

                    last_chunk_time = time.time()
                    buffer.extend(chunk)

                    latest_jpg = None
                    while True:
                        start = buffer.find(b"\xff\xd8")
                        if start == -1:
                            if len(buffer) > 1024 * 512:
                                buffer.clear()
                            break

                        end = buffer.find(b"\xff\xd9", start + 2)
                        if end == -1:
                            if start > 0:
                                del buffer[:start]
                            break

                        latest_jpg = bytes(buffer[start:end + 2])
                        del buffer[:end + 2]

                    if latest_jpg is not None:
                        image = cv2.imdecode(np.frombuffer(latest_jpg, dtype=np.uint8), cv2.IMREAD_COLOR)
                        if image is not None:
                            self.store_frame(image)

                response.close()
            except Exception as e:
                if not self.stopped:
                    print(f"[Camera] MJPEG stream error: {e}")

            if not self.stopped:
                print("[Camera] Reconnecting MJPEG stream...")
                time.sleep(0.5)

    def get_frame(self):
        with self.frame_lock:
            if self.frame is None:
                return None, self.frame_id, 0.0, self.capture_fps
            return self.frame.copy(), self.frame_id, self.last_frame_time, self.capture_fps

    def release(self):
        self.stopped = True
        if self.cap is not None:
            self.cap.release()

# --- INITIALIZATION ---
model = YOLO('best.pt')
model.fuse()

# Use GPU if available (CUDA), with half-precision for speed
import torch
DEVICE = 0 if torch.cuda.is_available() else 'cpu'
USE_HALF = torch.cuda.is_available()  # FP16 only works on GPU
if not torch.cuda.is_available():
    torch.set_num_threads(max(1, min(4, torch.get_num_threads())))


def run_ai_inference(camera):
    """Run YOLO in the background so the preview never waits on inference."""
    last_inference_time = 0.0

    while not camera.stopped:
        ai_enabled, _ = get_detection_modes()
        if not ai_enabled:
            with ai_state_lock:
                ai_state.occupied = False
                ai_state.max_confidence = 0.0
                ai_state.boxes = []
                ai_state.fps = 0.0
                ai_state.updated_at = time.time()
            time.sleep(0.2)
            continue

        now = time.time()
        remaining = AI_INTERVAL - (now - last_inference_time)
        if remaining > 0:
            time.sleep(remaining)

        frame, _, _, _ = camera.get_frame()
        if frame is None:
            time.sleep(0.01)
            continue

        frame = cv2.resize(frame, DISPLAY_SIZE, interpolation=cv2.INTER_AREA)
        infer_start = time.time()
        try:
            results = model.predict(
                frame,
                imgsz=AI_IMGSZ,
                verbose=False,
                device=DEVICE,
                half=USE_HALF,
                conf=AI_CONF,
                iou=0.45
            )
        except Exception as e:
            print(f"[AI] Inference error: {e}")
            time.sleep(0.2)
            continue

        boxes = []
        yolo_occupied = False
        max_confidence = 0.0

        for r in results:
            for box in r.boxes:
                class_id = int(box.cls[0])
                label = model.names[class_id]
                confidence = float(box.conf[0])
                if label not in ['Danger', 'Warning']:
                    continue

                yolo_occupied = True
                max_confidence = max(max_confidence, confidence)
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
                boxes.append({
                    "label": label,
                    "confidence": confidence,
                    "xyxy": (x1, y1, x2, y2),
                })

        elapsed = max(time.time() - infer_start, 0.001)
        with ai_state_lock:
            ai_state.occupied = yolo_occupied
            ai_state.max_confidence = max_confidence
            ai_state.boxes = boxes
            ai_state.fps = 1.0 / elapsed
            ai_state.updated_at = time.time()

        last_inference_time = time.time()


def draw_ai_boxes(frame, boxes):
    for item in boxes:
        x1, y1, x2, y2 = item["xyxy"]
        label = item["label"]
        confidence = item["confidence"]
        color = (0, 0, 255) if label == "Danger" else (0, 255, 255)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            frame,
            f"{label} {confidence:.2f}",
            (x1, max(20, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            color,
            2,
        )

# Start the phone GPS fallback speed tracker.
# ESP32 Hall speed is primary when /speed-webhook is receiving fresh data.
threading.Thread(target=update_sensors, daemon=True).start()

# Poll ESP32 /data as a backup for the Python/OpenCV window.
threading.Thread(target=update_from_esp32_dashboard, daemon=True).start()

# Persist alerts without blocking camera inference, webhooks, or display updates.
threading.Thread(target=alert_sender_worker, daemon=True).start()

# Pull AI/IR enable switches from the server while the monitor is running.
threading.Thread(target=refresh_detection_modes, daemon=True).start()

# Start the Flask Webhook for ESP32 IR and speed pushes
threading.Thread(target=run_webhook_server, daemon=True).start()

# Start the Heartbeat Thread (sends status to server)
threading.Thread(target=send_heartbeat, daemon=True).start()

cam = FastCamera(VIDEO_URL)
threading.Thread(target=run_ai_inference, args=(cam,), daemon=True).start()
prev_time = time.time()
last_display_frame_id = -1
last_repaint_time = 0.0
last_alert_time = 0  # Throttle alerts to avoid spam
last_alert_status = "SAFE"
ALERT_COOLDOWN = 2  # seconds between alerts

print(f"RiyaNeth Camera Source: {CAMERA_SOURCE}")
print(f"Video URL: {VIDEO_URL}")
if CAMERA_SOURCE == "phone":
    print(f"Phone sensor URL: {SENSOR_URL}")
print(f"ESP32 Webhooks Listening on Port {WEBHOOK_PORT}")
print("IR endpoint: /ir-webhook | Speed endpoint: /speed-webhook")
print(f"Configured ESP32 IR IP: {ESP_IP}")
print(f"ESP32 fallback data URL: {build_esp32_data_url(ESP_IP)}")
print(f"Display: {DISPLAY_SIZE[0]}x{DISPLAY_SIZE[1]} | YOLO imgsz={AI_IMGSZ} | conf={AI_CONF:.2f} | AI interval={AI_INTERVAL:.2f}s")
print("Logic: ALERT if Hall says bus moving, or GPS speed > 5km/h, AND footboard is occupied.")

while True:
    frame, frame_id, frame_time, camera_fps = cam.get_frame()
    if frame is None:
        time.sleep(0.01)
        continue

    is_new_camera_frame = frame_id != last_display_frame_id
    if not is_new_camera_frame and time.time() - last_repaint_time < 0.2:
        time.sleep(0.005)
        continue
    if is_new_camera_frame:
        last_display_frame_id = frame_id

    frame = cv2.resize(frame, DISPLAY_SIZE, interpolation=cv2.INTER_AREA)
    annotated_frame = frame.copy()

    # --- SENSOR FUSION LOGIC ---
    ai_enabled, ir_enabled = get_detection_modes()

    # 1. AI Detection (updated by the background inference thread)
    with ai_state_lock:
        yolo_occupied = ai_state.occupied if ai_enabled else False
        ai_max_confidence = ai_state.max_confidence if ai_enabled else 0.0
        ai_boxes = list(ai_state.boxes) if ai_enabled else []
        ai_fps = ai_state.fps

    if ai_enabled:
        draw_ai_boxes(annotated_frame, ai_boxes)

    # 2. IR Sensor Hardware Detection
    with ir_state_lock:
        current_ir_state = dict(ir_sensor_state)

    current_time = time.time()
    with speed_state_lock:
        hall_speed_fresh = (
            speed_sensor_state["online"]
            and current_time - speed_sensor_state["updated_at"] <= SPEED_SENSOR_STALE_SECONDS
        )
        hall_moving = hall_speed_fresh and speed_sensor_state["moving"]

    if hall_speed_fresh:
        speed_source_label = "Hall ESP32"
        speed_source_active = True
    elif current_speed_kmh > 0:
        speed_source_label = "Phone GPS"
        speed_source_active = True
    else:
        speed_source_label = "Waiting"
        speed_source_active = False

    ir_occupied = ir_enabled and (current_ir_state["s1"] or current_ir_state["s2"] or current_ir_state["s3"])
    ir_danger = ir_enabled and current_ir_state["s3"] # Bottom step is immediate danger
    
    # Combined Safety State
    footboard_occupied = yolo_occupied or ir_occupied

    # Hall sensor movement is primary because it reacts as soon as pulses arrive.
    # Phone GPS remains a fallback when Hall speed data is stale.
    is_moving = hall_moving if hall_speed_fresh else current_speed_kmh > 5.0
    
    # Determine alert source identity for the dashboard
    detection_source = "Safe"
    max_confidence = 0.0
    
    if footboard_occupied:
        if yolo_occupied and ir_occupied:
            detection_source = "AI + IR Sensors"
            max_confidence = 1.0
        elif yolo_occupied:
            detection_source = "AI Vision Only"
            max_confidence = ai_max_confidence
        elif ir_occupied:
            detection_source = "IR Sensors Only"
            max_confidence = 1.0 # Hardware blocked
            
            # Map occupied step for specific messaging
            if current_ir_state["s3"]: detection_source += " (Bottom Step)"
            elif current_ir_state["s2"]: detection_source += " (Mid Step)"
            elif current_ir_state["s1"]: detection_source += " (Top Step)"
    
    # --- Build step-specific label for message (S1=Entry, S2=Mid, S3=Bottom) ---
    active_ir_steps = []
    if ir_enabled and current_ir_state.get("s1"): active_ir_steps.append("S1-Entry")
    if ir_enabled and current_ir_state.get("s2"): active_ir_steps.append("S2-Mid")
    if ir_enabled and current_ir_state.get("s3"): active_ir_steps.append("S3-Bottom")
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
        if current_time - last_alert_time > ALERT_COOLDOWN or last_alert_status != "CRITICAL":
            send_alert(detection_source, "CRITICAL", current_speed_kmh, max_confidence, status_msg)
            last_alert_time = current_time
            last_alert_status = "CRITICAL"

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
            last_alert_status = "WARNING"

    # Safe
    else:
        overlay_color = (0, 255, 0) # Green
        status_msg = f"Footboard clear. Speed: {current_speed_kmh:.1f} km/h."
        last_alert_status = "SAFE"

    # --- UI RENDERING ---
    # Top Status Bar
    cv2.rectangle(annotated_frame, (0, 0), (DISPLAY_SIZE[0], 60), overlay_color, -1)
    cv2.putText(annotated_frame, status_msg, (15, 40), 
                cv2.FONT_HERSHEY_DUPLEX, 0.7, (255, 255, 255), 2)

    # Hardware / AI Status Indicator
    ir_label = "DISABLED" if not ir_enabled else ('ON' if current_ir_state['online'] else 'OFF')
    ir_color = (120, 120, 120) if not ir_enabled else ((0, 255, 0) if current_ir_state['online'] else (0, 0, 255))
    cv2.putText(annotated_frame, f"IR: {ir_label}", (20, 100),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, ir_color, 2)
    cv2.putText(annotated_frame, f"Speed: {speed_source_label} ({current_speed_kmh:.1f} km/h)", (20, 130),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0) if speed_source_active else (0, 200, 255), 2)

    # FPS Display
    curr_time = time.time()
    fps = 1 / max(curr_time - prev_time, 0.001)
    prev_time = curr_time
    last_repaint_time = curr_time
    frame_age = curr_time - frame_time if frame_time else 99.0
    cv2.putText(annotated_frame, f"Cam FPS: {camera_fps:.1f}", (DISPLAY_SIZE[0] - 160, 100),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    ai_label = f"AI FPS: {ai_fps:.1f}" if ai_enabled else "AI: DISABLED"
    cv2.putText(annotated_frame, ai_label, (DISPLAY_SIZE[0] - 160, 130),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    if frame_age > 1.0:
        cv2.putText(annotated_frame, "CAMERA STALE", (DISPLAY_SIZE[0] - 180, 160),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    cv2.imshow("RiyaNeth: AI + Speed Integrated Monitor", annotated_frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        cam.release()
        break

cv2.destroyAllWindows()
