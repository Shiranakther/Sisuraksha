import cv2
import threading
import time
import torch
import requests
import numpy as np
import argparse
import os
from collections import defaultdict
from ultralytics import YOLO
from datetime import datetime

try:
    import mediapipe as mp
except Exception:
    mp = None


# --- SERVER CONFIGURATION ---
SERVER_URL = "http://localhost:5000/api/driver-monitor"
DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1"

# --- CAMERA CONFIGURATION ---
USE_LAPTOP_CAMERA = True
LAPTOP_CAMERA_INDEX = 0
PHONE_IP = "10.60.136.249:8080"
VIDEO_URL = f"http://{PHONE_IP}/video"

FRAME_WIDTH = 640
FRAME_HEIGHT = 480
CAMERA_SOURCE = LAPTOP_CAMERA_INDEX if USE_LAPTOP_CAMERA else VIDEO_URL

# --- INFERENCE CONFIGURATION ---
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Driver_monitering_V2.pt")
BASE_INFER_CONF = 0.05
INFER_IMG_SIZE = 320
INFER_IOU = 0.5
INFER_MAX_DET = 8

# --- MOUNT RANGE CALIBRATION (STAGE 1) ---
MOUNT_PROFILE = "laptop"  # "laptop" (front camera) or "side" (A-pillar camera)
MOUNT_YAW_RANGE_BY_PROFILE = {
    "laptop": (0.0, 20.0),
    "side": (30.0, 40.0),
}
MOUNT_MAX_PITCH_DEG = 20.0
MOUNT_CALIBRATION_SECONDS = 3.0
MOUNT_MIN_VALID_SAMPLES = 35
MOUNT_MAX_YAW_STD_DEG = 5.0
MOUNT_MAX_PITCH_STD_DEG = 5.0

# --- DETECTION CALIBRATION (STAGE 2) ---
DETECTION_CALIBRATION_SECONDS = 4.0
DETECTION_CALIBRATION_CONF = 0.05

DEFAULT_CLASS_THRESHOLDS = {
    "phone_use": 0.15,
    "drowsy": 0.25,
    "eyes_closed": 0.25,
    "looking_away": 0.25,
    "yawning": 0.25,
    "eyes_narrowed": 0.25,
}

CLASS_MARGIN = {
    "phone_use": 0.02,
    "drowsy": 0.08,
    "eyes_closed": 0.08,
    "looking_away": 0.08,
    "yawning": 0.08,
    "eyes_narrowed": 0.08,
}

CLASS_THRESHOLD_BOUNDS = {
    "phone_use": (0.15, 0.60),
    "drowsy": (0.25, 0.85),
    "eyes_closed": (0.25, 0.85),
    "looking_away": (0.25, 0.85),
    "yawning": (0.25, 0.85),
    "eyes_narrowed": (0.25, 0.85),
}

# --- RUNTIME RELIABILITY GATES ---
RUNTIME_YAW_GATE_DEG = 12.0
RUNTIME_PITCH_GATE_DEG = 15.0
POSE_LOST_FRAMES_LIMIT = 12

POSE_SENSITIVE_CLASSES = {
    "drowsy",
    "eyes_closed",
    "looking_away",
    "yawning",
    "eyes_narrowed",
}

# --- HEARTBEAT / ALERT COOLDOWN ---
ALERT_COOLDOWN = 5
ALERT_THRESHOLD = 10
WINDOW_NAME = "Driver Monitoring V2.2"
SERVER_ENABLED = True


# --- GPU ACCELERATION ---
DEVICE = 0 if torch.cuda.is_available() else "cpu"
USE_HALF = torch.cuda.is_available()
print(f"Using device: {'GPU (CUDA)' if torch.cuda.is_available() else 'CPU'}")

last_alert_time = {}


# --- LABEL NORMALIZATION ---
CLASS_ALIASES = {
    "phone_use": "phone_use",
    "drowsy": "drowsy",
    "eyes_closed": "eyes_closed",
    "looking_away": "looking_away",
    "yawning": "yawning",
    "eyes_narrowed": "eyes_narrowed",
}


def normalize_label(label):
    key = str(label).strip().lower().replace(" ", "_")
    return CLASS_ALIASES.get(key, key)


def model_class_name(names, class_id):
    if isinstance(names, dict):
        return names.get(class_id, str(class_id))
    if isinstance(names, (list, tuple)) and 0 <= class_id < len(names):
        return names[class_id]
    return str(class_id)


# --- SERVER COMMUNICATION ---
def send_heartbeat():
    """Send heartbeat every 5 seconds to server."""
    while True:
        try:
            response = requests.post(
                f"{SERVER_URL}/heartbeat",
                json={"driver_id": DRIVER_ID},
                timeout=3,
            )
            if response.status_code == 200:
                data = response.json()
                ts = datetime.now().strftime("%H:%M:%S")
                status = "enabled" if data.get("system_enabled") else "disabled"
                print(f"[{ts}] Heartbeat OK - system {status}")
            else:
                ts = datetime.now().strftime("%H:%M:%S")
                print(f"[{ts}] Heartbeat failed: {response.status_code}")
        except requests.exceptions.RequestException as exc:
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] Heartbeat error: {str(exc)[:60]}")
        time.sleep(5)


def send_alert(alert_type, severity, message, confidence=None, detection_class=None, sound=False):
    """Send alert with a per-type cooldown to avoid server spam."""
    global last_alert_time
    if not SERVER_ENABLED:
        return False

    current_time = time.time()

    alert_key = f"{alert_type}_{severity}"
    if alert_key in last_alert_time and current_time - last_alert_time[alert_key] < ALERT_COOLDOWN:
        return False

    last_alert_time[alert_key] = current_time

    payload = {
        "driver_id": DRIVER_ID,
        "alert_type": alert_type,
        "severity": severity,
        "message": message,
        "sound": sound,
    }
    if confidence is not None:
        payload["confidence"] = confidence
    if detection_class:
        payload["detection_class"] = detection_class

    try:
        response = requests.post(f"{SERVER_URL}/alerts", json=payload, timeout=3)
        if response.status_code == 201:
            ts = datetime.now().strftime("%H:%M:%S")
            print(f"[{ts}] Alert sent: {severity} - {alert_type}")
            return True
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] Alert failed: {response.status_code}")
        return False
    except requests.exceptions.RequestException as exc:
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] Alert error: {str(exc)[:60]}")
        return False


# --- THREADED CAMERA CLASS ---
class FastCamera:
    def __init__(self, source, width=640, height=480):
        # On Windows laptops, CAP_DSHOW typically opens webcam indexes faster and
        # avoids long blocking calls seen with the default backend.
        if isinstance(source, int):
            self.cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
            if not self.cap.isOpened():
                self.cap.release()
                self.cap = cv2.VideoCapture(source)
        else:
            self.cap = cv2.VideoCapture(source)

        if not self.cap.isOpened():
            raise RuntimeError(f"Cannot open camera source: {source}")

        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        self.frame = None
        self.stopped = False
        self.lock = threading.Lock()
        self.thread = threading.Thread(target=self.update, daemon=True)
        self.thread.start()

    def update(self):
        while not self.stopped:
            ret, frame = self.cap.read()
            if ret:
                with self.lock:
                    self.frame = frame

    def get_frame(self):
        with self.lock:
            return None if self.frame is None else self.frame.copy()

    def release(self):
        self.stopped = True
        self.cap.release()


# --- POSE ESTIMATION HELPERS ---
LANDMARK_NOSE = 1
LANDMARK_CHIN = 152
LANDMARK_LEFT_EYE_OUTER = 33
LANDMARK_RIGHT_EYE_OUTER = 263
LANDMARK_MOUTH_LEFT = 61
LANDMARK_MOUTH_RIGHT = 291


def _normalize_angle_deg(angle):
    value = float(angle)
    while value > 180.0:
        value -= 360.0
    while value < -180.0:
        value += 360.0
    return value


def _fold_pose_angle_deg(angle):
    """
    Fold Euler angle ambiguity to a practical range for head pose checks.

    solvePnP + projection decomposition can return equivalent orientations near
    +/-180 deg for frontal faces (for example pitch ~174 instead of -6). For
    calibration we want the nearest equivalent angle around 0.
    """
    value = _normalize_angle_deg(angle)
    if value > 90.0:
        value -= 180.0
    elif value < -90.0:
        value += 180.0
    return value


def estimate_head_pose_deg(frame, face_mesh):
    """Estimate head pose in degrees using MediaPipe + solvePnP."""
    h, w = frame.shape[:2]
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)
    if not results.multi_face_landmarks:
        return None

    lm = results.multi_face_landmarks[0].landmark
    image_points = np.array(
        [
            (lm[LANDMARK_NOSE].x * w, lm[LANDMARK_NOSE].y * h),
            (lm[LANDMARK_CHIN].x * w, lm[LANDMARK_CHIN].y * h),
            (lm[LANDMARK_LEFT_EYE_OUTER].x * w, lm[LANDMARK_LEFT_EYE_OUTER].y * h),
            (lm[LANDMARK_RIGHT_EYE_OUTER].x * w, lm[LANDMARK_RIGHT_EYE_OUTER].y * h),
            (lm[LANDMARK_MOUTH_LEFT].x * w, lm[LANDMARK_MOUTH_LEFT].y * h),
            (lm[LANDMARK_MOUTH_RIGHT].x * w, lm[LANDMARK_MOUTH_RIGHT].y * h),
        ],
        dtype=np.float64,
    )

    # Generic 3D face model points for PnP.
    model_points = np.array(
        [
            (0.0, 0.0, 0.0),
            (0.0, -330.0, -65.0),
            (-225.0, 170.0, -135.0),
            (225.0, 170.0, -135.0),
            (-150.0, -150.0, -125.0),
            (150.0, -150.0, -125.0),
        ],
        dtype=np.float64,
    )

    focal_length = float(w)
    camera_matrix = np.array(
        [
            [focal_length, 0.0, w / 2.0],
            [0.0, focal_length, h / 2.0],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    ok, rvec, tvec = cv2.solvePnP(
        model_points,
        image_points,
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not ok:
        return None

    rmat, _ = cv2.Rodrigues(rvec)
    pose_mat = np.hstack((rmat, tvec))
    _, _, _, _, _, _, euler = cv2.decomposeProjectionMatrix(pose_mat)

    pitch = _fold_pose_angle_deg(euler[0][0])
    yaw = _fold_pose_angle_deg(euler[1][0])
    roll = _normalize_angle_deg(euler[2][0])
    return {"yaw": yaw, "pitch": pitch, "roll": roll}


def draw_banner(frame, title, subtitle, color):
    cv2.rectangle(frame, (0, 0), (FRAME_WIDTH, 72), color, -1)
    cv2.putText(frame, title, (10, 28), cv2.FONT_HERSHEY_DUPLEX, 0.65, (255, 255, 255), 2)
    cv2.putText(frame, subtitle, (10, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1)


def show_status_message(cam, title, subtitle, color=(0, 120, 255), seconds=1.5):
    """Show a full-screen status message for a short hold period."""
    end_time = time.time() + seconds
    while time.time() < end_time:
        frame = cam.get_frame()
        if frame is None:
            continue
        frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
        draw_banner(frame, title, subtitle, color)
        cv2.putText(frame, "Press q to quit", (10, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 1)
        cv2.imshow(WINDOW_NAME, frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            return False
    return True


def run_mount_calibration(cam, face_mesh, mount_profile):
    """Stage 1: verify mounting range and stable neutral pose baseline."""
    yaw_min, yaw_max = MOUNT_YAW_RANGE_BY_PROFILE.get(mount_profile, (0.0, 20.0))
    attempt = 0

    while True:
        attempt += 1
        yaw_samples = []
        pitch_samples = []
        start_time = time.time()

        while time.time() - start_time < MOUNT_CALIBRATION_SECONDS:
            frame = cam.get_frame()
            if frame is None:
                continue
            frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))

            pose = estimate_head_pose_deg(frame, face_mesh)
            progress = int(min(100, ((time.time() - start_time) / MOUNT_CALIBRATION_SECONDS) * 100))

            if pose is not None:
                yaw_samples.append(pose["yaw"])
                pitch_samples.append(pose["pitch"])
                subtitle = (
                    f"Look straight. Yaw={pose['yaw']:+.1f} deg Pitch={pose['pitch']:+.1f} deg "
                    f"{progress}%"
                )
            else:
                subtitle = f"Face not found. Align face with camera. {progress}%"

            draw_banner(
                frame,
                f"Calibration 1/2: Mount Range Check (Attempt {attempt})",
                subtitle,
                (255, 180, 0),
            )
            cv2.putText(
                frame,
                f"Target |yaw| range ({mount_profile}): {yaw_min:.0f} to {yaw_max:.0f} deg",
                (10, 95),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (255, 255, 255),
                1,
            )
            cv2.putText(
                frame,
                "Press q to quit",
                (10, 118),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.52,
                (255, 255, 255),
                1,
            )
            cv2.imshow(WINDOW_NAME, frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                return None

        if len(yaw_samples) < MOUNT_MIN_VALID_SAMPLES:
            ok = show_status_message(
                cam,
                "Mount calibration failed",
                f"Not enough face samples ({len(yaw_samples)}). Keep face visible and retry.",
                color=(0, 0, 200),
            )
            if not ok:
                return None
            continue

        yaw_median = float(np.median(yaw_samples))
        pitch_median = float(np.median(pitch_samples))
        yaw_std = float(np.std(yaw_samples))
        pitch_std = float(np.std(pitch_samples))

        abs_yaw = abs(yaw_median)
        in_yaw_range = yaw_min <= abs_yaw <= yaw_max
        pitch_ok = abs(pitch_median) <= MOUNT_MAX_PITCH_DEG
        stable = yaw_std <= MOUNT_MAX_YAW_STD_DEG and pitch_std <= MOUNT_MAX_PITCH_STD_DEG

        if in_yaw_range and pitch_ok and stable:
            subtitle = (
                f"Accepted. baseline yaw={yaw_median:+.1f} pitch={pitch_median:+.1f} "
                f"std=({yaw_std:.1f}/{pitch_std:.1f})"
            )
            ok = show_status_message(
                cam,
                "Mount calibration passed",
                subtitle,
                color=(0, 160, 0),
                seconds=1.8,
            )
            if not ok:
                return None
            print(
                f"[CAL] Mount baseline accepted: yaw={yaw_median:+.2f} deg, "
                f"pitch={pitch_median:+.2f} deg, profile={mount_profile}"
            )
            return {
                "baseline_yaw": yaw_median,
                "baseline_pitch": pitch_median,
                "yaw_std": yaw_std,
                "pitch_std": pitch_std,
            }

        reasons = []
        if not in_yaw_range:
            reasons.append(f"|yaw|={abs_yaw:.1f} not in {yaw_min:.0f}-{yaw_max:.0f}")
        if not pitch_ok:
            reasons.append(f"|pitch|={abs(pitch_median):.1f} > {MOUNT_MAX_PITCH_DEG:.0f}")
        if not stable:
            reasons.append(f"unstable std(y/p)=({yaw_std:.1f}/{pitch_std:.1f})")

        reason_text = "; ".join(reasons)
        ok = show_status_message(
            cam,
            "Mount calibration failed",
            reason_text,
            color=(0, 0, 200),
            seconds=2.2,
        )
        if not ok:
            return None


def run_detection_calibration(cam, model):
    """Stage 2: learn scene-specific confidence floors from neutral driving posture."""
    samples = defaultdict(list)
    start_time = time.time()
    frame_count = 0

    while time.time() - start_time < DETECTION_CALIBRATION_SECONDS:
        frame = cam.get_frame()
        if frame is None:
            continue

        frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
        results = model.predict(
            frame,
            imgsz=INFER_IMG_SIZE,
            conf=DETECTION_CALIBRATION_CONF,
            iou=INFER_IOU,
            device=DEVICE,
            half=USE_HALF,
            verbose=False,
            max_det=INFER_MAX_DET,
        )
        frame_count += 1

        boxes = results[0].boxes
        if boxes is not None and len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0].item())
                label = normalize_label(model_class_name(model.names, cls_id))
                conf = float(box.conf[0].item())
                samples[label].append(conf)

        progress = int(min(100, ((time.time() - start_time) / DETECTION_CALIBRATION_SECONDS) * 100))
        annotated = results[0].plot()
        draw_banner(
            annotated,
            "Calibration 2/2: Threshold Learning",
            f"Keep neutral (no yawn/phone/distraction). {progress}%",
            (0, 170, 220),
        )
        cv2.putText(
            annotated,
            f"Frames: {frame_count}",
            (10, 95),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            (255, 255, 255),
            1,
        )
        cv2.putText(
            annotated,
            "Press q to quit",
            (10, 118),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            (255, 255, 255),
            1,
        )
        cv2.imshow(WINDOW_NAME, annotated)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            return None

    thresholds = dict(DEFAULT_CLASS_THRESHOLDS)
    for label, default_thr in DEFAULT_CLASS_THRESHOLDS.items():
        conf_samples = samples.get(label, [])
        if not conf_samples:
            continue

        p95 = float(np.percentile(conf_samples, 95))
        margin = CLASS_MARGIN.get(label, 0.08)
        lo, hi = CLASS_THRESHOLD_BOUNDS.get(label, (default_thr, 0.95))
        calibrated = max(default_thr, p95 + margin)
        thresholds[label] = float(np.clip(calibrated, lo, hi))

    print("[CAL] Dynamic thresholds:")
    for label in sorted(thresholds.keys()):
        print(f"      {label:<14} >= {thresholds[label]:.3f}")

    ok = show_status_message(
        cam,
        "Detection calibration complete",
        "Dynamic confidence thresholds learned.",
        color=(0, 160, 0),
        seconds=1.4,
    )
    if not ok:
        return None
    return thresholds


def extract_filtered_detections(results, names, thresholds):
    """Convert raw YOLO output to label->best_confidence after per-class thresholds."""
    detections = {}
    if not results:
        return detections

    boxes = results[0].boxes
    if boxes is None or len(boxes) == 0:
        return detections

    for box in boxes:
        cls_id = int(box.cls[0].item())
        label = normalize_label(model_class_name(names, cls_id))
        conf = float(box.conf[0].item())

        threshold = thresholds.get(label, 0.25)
        if conf >= threshold and conf > detections.get(label, 0.0):
            detections[label] = conf

    return detections


def perform_startup_calibration(cam, model, face_mesh, mount_profile):
    mount = run_mount_calibration(cam, face_mesh, mount_profile)
    if mount is None:
        return None, None

    thresholds = run_detection_calibration(cam, model)
    if thresholds is None:
        return None, None

    return mount, thresholds


def parse_args():
    default_camera = "laptop" if USE_LAPTOP_CAMERA else "phone"
    parser = argparse.ArgumentParser(
        description="Driver Monitoring V2.2 with startup calibration checks"
    )
    parser.add_argument(
        "--camera",
        choices=["laptop", "phone"],
        default=default_camera,
        help="Choose camera source for this run.",
    )
    parser.add_argument(
        "--mount-profile",
        choices=["laptop", "side"],
        default=MOUNT_PROFILE,
        help="Expected camera mount geometry profile.",
    )
    parser.add_argument(
        "--startup-only",
        action="store_true",
        help="Run only startup calibration (range + threshold) and exit.",
    )
    parser.add_argument(
        "--no-server",
        action="store_true",
        help="Disable heartbeat and alert API calls.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    active_camera_source = LAPTOP_CAMERA_INDEX if args.camera == "laptop" else VIDEO_URL
    active_mount_profile = args.mount_profile

    global SERVER_ENABLED
    SERVER_ENABLED = not args.no_server

    print("=" * 60)
    print("DRIVER MONITORING SYSTEM V2.2")
    print("=" * 60)

    if mp is None:
        print("[ERROR] mediapipe is required for calibration. Install: pip install mediapipe")
        return

    try:
        model = YOLO(MODEL_PATH)
        model.fuse()
        print(f"[INFO] Model loaded: {MODEL_PATH}")
        print(f"[INFO] Model classes: {model.names}")
    except Exception as exc:
        print(f"[ERROR] Failed to load model: {exc}")
        return

    # Start heartbeat thread for server integration when enabled.
    if SERVER_ENABLED:
        heartbeat_thread = threading.Thread(target=send_heartbeat, daemon=True)
        heartbeat_thread.start()
        print(f"[INFO] Heartbeat enabled: {SERVER_URL}")
    else:
        print("[INFO] Server integration disabled for this run (--no-server).")

    source_desc = f"laptop camera index {LAPTOP_CAMERA_INDEX}" if args.camera == "laptop" else VIDEO_URL
    print(f"[INFO] Connecting to camera source: {source_desc}")
    print(f"[INFO] Mount profile: {active_mount_profile}")

    try:
        cam = FastCamera(active_camera_source, width=FRAME_WIDTH, height=FRAME_HEIGHT)
    except Exception as exc:
        print(f"[ERROR] Camera open failed: {exc}")
        return

    face_mesh = mp.solutions.face_mesh.FaceMesh(
        max_num_faces=1,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
        refine_landmarks=True,
    )

    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WINDOW_NAME, FRAME_WIDTH, FRAME_HEIGHT)

    time.sleep(1.5)

    mount_cal, class_thresholds = perform_startup_calibration(
        cam, model, face_mesh, active_mount_profile
    )
    if mount_cal is None or class_thresholds is None:
        cam.release()
        face_mesh.close()
        cv2.destroyAllWindows()
        print("[INFO] Exiting before runtime detection.")
        return

    if args.startup_only:
        cam.release()
        face_mesh.close()
        cv2.destroyAllWindows()
        print("[INFO] Startup-only calibration check complete.")
        return

    baseline_yaw = mount_cal["baseline_yaw"]
    baseline_pitch = mount_cal["baseline_pitch"]

    print("[INFO] Runtime started. Press 'r' to recalibrate, 'q' to quit.")
    alert_frames = 0
    prev_time = time.time()
    pose_lost_frames = 0
    last_pose_reliable = True
    yaw_rel = 0.0
    pitch_rel = 0.0

    while True:
        frame = cam.get_frame()
        if frame is None:
            continue

        frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))
        pose = estimate_head_pose_deg(frame, face_mesh)

        if pose is not None:
            pose_lost_frames = 0
            yaw_rel = pose["yaw"] - baseline_yaw
            pitch_rel = pose["pitch"] - baseline_pitch
            pose_reliable = (
                abs(yaw_rel) <= RUNTIME_YAW_GATE_DEG
                and abs(pitch_rel) <= RUNTIME_PITCH_GATE_DEG
            )
            last_pose_reliable = pose_reliable
        else:
            pose_lost_frames += 1
            pose_reliable = last_pose_reliable and pose_lost_frames <= POSE_LOST_FRAMES_LIMIT

        results = model.predict(
            frame,
            imgsz=INFER_IMG_SIZE,
            conf=BASE_INFER_CONF,
            iou=INFER_IOU,
            device=DEVICE,
            half=USE_HALF,
            verbose=False,
            max_det=INFER_MAX_DET,
        )

        current_detections = extract_filtered_detections(results, model.names, class_thresholds)

        if not pose_reliable:
            for key in list(current_detections.keys()):
                if key in POSE_SENSITIVE_CLASSES:
                    current_detections.pop(key, None)

        status_text = "DRIVER ALERT"
        status_color = (0, 255, 0)
        is_warning = False

        if not pose_reliable:
            status_text = "POSE OUT OF RANGE - RECENTER"
            status_color = (0, 140, 255)
            alert_frames = max(0, alert_frames - 1)

        elif "drowsy" in current_detections or "eyes_closed" in current_detections:
            status_text = "DROWSY - WAKE UP"
            status_color = (0, 0, 255)
            alert_frames += 2

            conf = max(current_detections.get("drowsy", 0.0), current_detections.get("eyes_closed", 0.0))
            send_alert(
                alert_type="drowsy",
                severity="DANGER",
                message="Driver appears drowsy. Wake up immediately.",
                confidence=conf,
                detection_class="drowsy_or_eyes_closed",
                sound=True,
            )

        elif "phone_use" in current_detections:
            status_text = "PHONE DETECTED"
            status_color = (0, 0, 255)
            alert_frames += 1

            send_alert(
                alert_type="phone_use",
                severity="DANGER",
                message="Phone usage detected. Put the phone down.",
                confidence=current_detections["phone_use"],
                detection_class="phone_use",
                sound=True,
            )

        elif "looking_away" in current_detections:
            status_text = "EYES ON ROAD"
            status_color = (0, 0, 255)
            alert_frames += 1

            send_alert(
                alert_type="looking_away",
                severity="DANGER",
                message="Driver looking away from road.",
                confidence=current_detections["looking_away"],
                detection_class="looking_away",
                sound=True,
            )

        elif "yawning" in current_detections or "eyes_narrowed" in current_detections:
            status_text = "FATIGUE WARNING"
            status_color = (0, 165, 255)
            is_warning = True

            if "yawning" in current_detections:
                send_alert(
                    alert_type="yawning",
                    severity="WARNING",
                    message="Yawning detected. Consider taking a break.",
                    confidence=current_detections["yawning"],
                    detection_class="yawning",
                    sound=False,
                )
            elif "eyes_narrowed" in current_detections:
                send_alert(
                    alert_type="eyes_narrowed",
                    severity="WARNING",
                    message="Eyes narrowing detected. Possible fatigue.",
                    confidence=current_detections["eyes_narrowed"],
                    detection_class="eyes_narrowed",
                    sound=False,
                )

        else:
            alert_frames = max(0, alert_frames - 1)

        annotated_frame = results[0].plot()

        if status_text.startswith("POSE OUT OF RANGE"):
            display_color = status_color
            display_text = status_text
        else:
            display_color = status_color if (alert_frames >= ALERT_THRESHOLD or is_warning) else (0, 255, 0)
            display_text = status_text if (alert_frames >= ALERT_THRESHOLD or is_warning) else "DRIVER ALERT"

        cv2.rectangle(annotated_frame, (0, 0), (FRAME_WIDTH, 62), display_color, -1)
        cv2.putText(
            annotated_frame,
            display_text,
            (10, 40),
            cv2.FONT_HERSHEY_DUPLEX,
            0.72,
            (255, 255, 255),
            2,
        )

        if current_detections:
            det_str = " | ".join([f"{k}:{int(v * 100)}%" for k, v in current_detections.items()])
            cv2.putText(
                annotated_frame,
                det_str,
                (10, 90),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
            )

        cur_time = time.time()
        fps = 1.0 / (cur_time - prev_time + 1e-3)
        prev_time = cur_time

        yaw_min, yaw_max = MOUNT_YAW_RANGE_BY_PROFILE.get(active_mount_profile, (0.0, 20.0))
        cv2.putText(
            annotated_frame,
            f"YawRel={yaw_rel:+.1f} PitchRel={pitch_rel:+.1f} PoseOK={pose_reliable}",
            (10, 114),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (200, 255, 255),
            1,
        )
        cv2.putText(
            annotated_frame,
            f"MountProfile={active_mount_profile} target|yaw|={yaw_min:.0f}-{yaw_max:.0f} deg",
            (10, 136),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (200, 255, 255),
            1,
        )
        cv2.putText(
            annotated_frame,
            f"AlertBuffer={alert_frames}/{ALERT_THRESHOLD} FPS={int(fps)}",
            (10, 158),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (200, 255, 255),
            1,
        )
        cv2.putText(
            annotated_frame,
            "Keys: r=recalibrate q=quit",
            (10, 180),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (200, 255, 255),
            1,
        )

        cv2.imshow(WINDOW_NAME, annotated_frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r"):
            print("[INFO] Recalibration requested...")
            mount_cal, class_thresholds = perform_startup_calibration(
                cam, model, face_mesh, active_mount_profile
            )
            if mount_cal is None or class_thresholds is None:
                break

            baseline_yaw = mount_cal["baseline_yaw"]
            baseline_pitch = mount_cal["baseline_pitch"]
            alert_frames = 0
            pose_lost_frames = 0
            last_pose_reliable = True
            yaw_rel = 0.0
            pitch_rel = 0.0
            print("[INFO] Recalibration complete.")

    cam.release()
    face_mesh.close()
    cv2.destroyAllWindows()
    print("[INFO] System stopped.")


if __name__ == "__main__":
    main()