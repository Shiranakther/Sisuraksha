# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Driver Monitoring System  (Main Loop)
# IT22610102 | Pinto R.I.S.R | 25-26J-282
#
# Webcam-based driver monitoring using MediaPipe Face Mesh.
# Detects: drowsiness, yawning, distraction, microsleep.
# Press 'q' to quit.  Press 'r' to recalibrate.
# ══════════════════════════════════════════════════════════════

import sys
import json
import time
import threading
import queue
from pathlib import Path
import cv2
import numpy as np
import mediapipe as mp
import requests
from datetime import datetime


def _attach_repo_root():
    this_file = Path(__file__).resolve()
    for parent in this_file.parents:
        if (parent / "shared_network_config.py").exists():
            root_path = str(parent)
            if root_path not in sys.path:
                sys.path.append(root_path)
            return


_attach_repo_root()

from shared_network_config import load_network_config

from config import (
    CAMERA_INDEX, FRAME_WIDTH, FRAME_HEIGHT,
    MIN_DETECTION_CONF, MIN_TRACKING_CONF,
    LEFT_EYE, RIGHT_EYE, MOUTH,
    STAGE_DISPLAY, PHONE_ENABLED, IRIS_ENABLED,
    SERVER_ENABLED, HEARTBEAT_INTERVAL_SEC, ALERT_TIMEOUT_SEC,
    DEBUG_PRINT_EVERY, DRAW_EYE_CONTOURS,
    HEAD_NOD_MIN_PERCLOS, HEAD_NOD_REQUIRE_EYE_FATIGUE,
    CALIBRATION_FRAMES,
    EAR_STRONG_CLOSED_RATIO,
    YAW_THRESHOLD, PITCH_DOWN_THRESHOLD, MIRROR_YAW_THRESHOLD,
    DISTRACTION_YAW_THRESHOLD, GAZE_CONFIDENCE_MIN,
    PHONE_LOOK_EAR_OPEN_MARGIN,
)
from face_metrics import get_dominant_ear, get_mar, get_head_pose, reset_head_pose_smoothing
from iris_gaze import GazeAttentionTracker, get_gaze, get_attention_state
from drowsiness import DrowsinessDetector
from calibration import Calibrator
from state_machine import StateMachine
from phone_detector import PhoneDetector
from signal_quality import build_measurement_quality, normalize_ear


# ══════════════════════════════════════════════════════════════
#  Server Integration Configuration
# ══════════════════════════════════════════════════════════════
NETWORK_CONFIG = load_network_config()
SERVER_URL = NETWORK_CONFIG["DRIVER_MONITOR_SERVER_URL"]
DRIVER_ID = NETWORK_CONFIG["DRIVER_ID"]

# Alert cooldown tracking
_last_alert_time = {}
ALERT_COOLDOWN = 5  # seconds between same alert type
_alert_queue = queue.Queue(maxsize=64)
_command_queue = queue.Queue(maxsize=16)
_last_heartbeat_error_log = 0.0
_last_alert_error_log = 0.0
_stop_event = threading.Event()  # set to cleanly stop the main loop

CALIBRATION_STATUS_PREFIX = "[CALIB_STATUS]"
CALIBRATION_PROFILE_PATH = Path(__file__).with_name("driver_monitor_calibration.json")

# Map driver states to alert types for the server
STATE_TO_ALERT = {
    "DROWSY":       {"alert_type": "drowsy",       "severity": "DANGER",  "sound": True},
    "MICROSLEEP":   {"alert_type": "microsleep",   "severity": "DANGER",  "sound": True},
    "FATIGUED":     {"alert_type": "fatigue",       "severity": "WARNING", "sound": False},
    "YAWNING":      {"alert_type": "yawning",       "severity": "WARNING", "sound": False},
    "DISTRACTED":   {"alert_type": "looking_away",  "severity": "WARNING", "sound": True},
    "LOOKING DOWN": {"alert_type": "looking_away",  "severity": "WARNING", "sound": False},
    "PHONE IN LAP": {"alert_type": "looking_away",  "severity": "WARNING", "sound": False},
    "PHONE USE":    {"alert_type": "phone_use",     "severity": "DANGER",  "sound": True},
    "EYES OFF ROAD":{"alert_type": "looking_away",  "severity": "WARNING", "sound": True},
    "NO FACE":      {"alert_type": "no_face",       "severity": "WARNING", "sound": False},
}


def save_calibration_profile(calibrator, camera_index, width, height):
    profile = calibrator.export_profile()
    if not profile:
        return False

    payload = {
        "camera_index": camera_index,
        "frame_width": width,
        "frame_height": height,
        "saved_at": datetime.utcnow().isoformat() + "Z",
        "profile": profile,
    }
    try:
        CALIBRATION_PROFILE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return True
    except Exception as exc:
        print(f"[WARN] Failed to save calibration profile: {exc}")
        return False


def try_load_calibration_profile(calibrator, camera_index, width, height):
    if not CALIBRATION_PROFILE_PATH.exists():
        return False

    try:
        payload = json.loads(CALIBRATION_PROFILE_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[WARN] Failed to read calibration profile: {exc}")
        return False

    if payload.get("camera_index") != camera_index:
        return False
    if payload.get("frame_width") != width or payload.get("frame_height") != height:
        return False

    return calibrator.load_profile(payload.get("profile"))


def send_heartbeat():
    """Send heartbeat every 5 seconds to keep system status online."""
    global _last_heartbeat_error_log

    if not SERVER_ENABLED:
        return

    while not _stop_event.is_set():
        try:
            response = requests.post(
                f"{SERVER_URL}/heartbeat",
                json={"driver_id": DRIVER_ID},
                timeout=ALERT_TIMEOUT_SEC
            )
            if response.status_code == 200:
                data = response.json()
                ts = datetime.now().strftime('%H:%M:%S')
                print(f"[{ts}] ❤️ Heartbeat OK — system {'enabled' if data.get('system_enabled') else 'disabled'}")
        except requests.exceptions.RequestException as e:
            now = time.time()
            if now - _last_heartbeat_error_log >= HEARTBEAT_INTERVAL_SEC:
                ts = datetime.now().strftime('%H:%M:%S')
                print(f"[{ts}] ❌ Heartbeat error: {str(e)[:60]}")
                _last_heartbeat_error_log = now
        _stop_event.wait(timeout=HEARTBEAT_INTERVAL_SEC)


def _send_alert_payload(payload, state):
    """Send one alert payload (runs in background thread)."""
    global _last_alert_error_log

    try:
        response = requests.post(f"{SERVER_URL}/alerts", json=payload, timeout=ALERT_TIMEOUT_SEC)
        if response.status_code == 201:
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"[{ts}] 🚨 Alert sent: {state} ({payload['severity']})")
    except requests.exceptions.RequestException as e:
        now = time.time()
        if now - _last_alert_error_log >= HEARTBEAT_INTERVAL_SEC:
            ts = datetime.now().strftime('%H:%M:%S')
            print(f"[{ts}] ❌ Alert send failed: {str(e)[:60]}")
            _last_alert_error_log = now


def _alert_sender_worker():
    """Background worker to prevent main-loop stalls on network latency."""
    while True:
        item = _alert_queue.get()
        if item is None:
            break
        payload, state = item
        _send_alert_payload(payload, state)


def send_alert(state, confidence=None, detection_class=None):
    """Send an alert to the server if state is non-normal, with cooldown."""
    global _last_alert_time

    if not SERVER_ENABLED:
        return

    if state not in STATE_TO_ALERT:
        return

    alert_info = STATE_TO_ALERT[state]
    alert_key = f"{alert_info['alert_type']}_{alert_info['severity']}"
    now = time.time()

    # Cooldown check
    if alert_key in _last_alert_time:
        if now - _last_alert_time[alert_key] < ALERT_COOLDOWN:
            return
    _last_alert_time[alert_key] = now

    payload = {
        "driver_id": DRIVER_ID,
        "alert_type": alert_info["alert_type"],
        "severity": alert_info["severity"],
        "confidence": confidence,
        "message": f"Driver state: {state}",
        "sound": alert_info["sound"],
        "detection_class": detection_class or state,
    }

    try:
        _alert_queue.put_nowait((payload, state))
    except queue.Full:
        # Drop excess alerts rather than stalling the main loop.
        return


def emit_calibration_status(
    status,
    progress=0,
    frames_collected=0,
    total_frames=CALIBRATION_FRAMES,
    instruction="",
    reject_reason="",
    skip_reason="",
    attempt=1,
    auto_retry_used=False,
    source="manual",
    stage_name="",
    stage_phase="",
    accepted_samples=0,
    skipped_frames=0,
    in_progress=None,
):
    """Emit structured calibration status for server-side parsing."""
    if in_progress is None:
        in_progress = status in ("IN_PROGRESS", "REJECTED")

    payload = {
        "status": status,
        "inProgress": bool(in_progress),
        "progressPercent": int(progress),
        "framesCollected": int(max(0, frames_collected)),
        "totalFrames": int(max(1, total_frames)),
        "instruction": instruction,
        "rejectReason": reject_reason,
        "skipReason": skip_reason,
        "attempt": int(max(1, attempt)),
        "autoRetryUsed": bool(auto_retry_used),
        "source": source,
        "stageName": stage_name,
        "stagePhase": stage_phase,
        "acceptedSampleCount": int(max(0, accepted_samples)),
        "skippedFrameCount": int(max(0, skipped_frames)),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
    print(f"{CALIBRATION_STATUS_PREFIX}{json.dumps(payload)}", flush=True)


def _stdin_command_listener():
    """Listen for runtime commands sent from the Node.js process."""
    while True:
        line = sys.stdin.readline()
        if not line:
            # stdin closed — Node.js process ended, trigger clean shutdown
            _stop_event.set()
            break

        cmd = line.strip().lower()
        if cmd in ("recalibrate", "r"):
            try:
                _command_queue.put_nowait("recalibrate")
            except queue.Full:
                pass
        elif cmd in ("retry",):
            try:
                _command_queue.put_nowait("retry")
            except queue.Full:
                pass
        elif cmd in ("stop", "quit", "exit"):
            print("[INFO] Stop command received — shutting down.")
            _stop_event.set()
            break


# ══════════════════════════════════════════════════════════════
#  Initialise MediaPipe Face Mesh
# ══════════════════════════════════════════════════════════════
mp_face_mesh = mp.solutions.face_mesh
mp_drawing   = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    min_detection_confidence=MIN_DETECTION_CONF,
    min_tracking_confidence=MIN_TRACKING_CONF,
    refine_landmarks=IRIS_ENABLED,   # skip iris refinement on low-spec mode when disabled
)


# ══════════════════════════════════════════════════════════════
#  Helper — draw a dashboard overlay on the frame
# ══════════════════════════════════════════════════════════════
def draw_dashboard(frame, driver_state):
    """Render metric panel and status bar on the video frame."""
    h, w = frame.shape[:2]
    state   = driver_state["state"]
    color   = driver_state["color"]
    stage   = driver_state["stage"]

    # ── Top status bar ────────────────────────────────
    cv2.rectangle(frame, (0, 0), (w, 40), color, -1)
    label = f'{state}  (Stage {stage})'
    cv2.putText(frame, label, (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    # ── Metrics panel (bottom-left) ───────────────────
    panel_x = 10
    metrics = [
        f"EAR:      {driver_state['ear']:.3f}",
        f"EAR Conf: {driver_state.get('ear_confidence', 0.0):.2f}",
        f"EAR Norm: {driver_state.get('ear_norm', 0.0):.2f}",
        f"MAR:      {driver_state['mar']:.3f}",
        f"PERCLOS:  {driver_state['perclos']:.1f}%",
        f"Yaw:      {driver_state['yaw']:.1f}°",
        f"Pitch:    {driver_state['pitch']:.2f}°",
        f"Nod:      {'YES' if driver_state.get('head_nod_active') else 'No '}  dP={driver_state.get('head_nod_drop', 0.0):.2f}",
        f"Blink ms: {driver_state['avg_blink_ms']:.0f}",
        f"Gaze H/V: {driver_state['gaze_h']:.2f} / {driver_state['gaze_v']:.2f}",
        f"Gaze Cnf: {driver_state.get('gaze_confidence', 0.0):.2f}  Eye:{driver_state.get('dominant_eye', 'na')}",
        f"Quality:  {driver_state.get('quality_level', 'NA')} {driver_state.get('quality_score', 0.0):.2f}",
        f"Mirror:   {driver_state.get('mirror_elapsed', 0.0):.2f}s",
        f"Phone:    {'YES ' + str(driver_state.get('phone_conf', 0)) if driver_state.get('phone_detected') else 'No'}",
        f"Reason:   {driver_state.get('reason', '-')[:34]}",
    ]
    panel_height = len(metrics) * 22 + 20
    panel_y = max(18, h - panel_height)

    # Semi-transparent background
    overlay = frame.copy()
    cv2.rectangle(overlay, (panel_x - 5, panel_y - 15),
                  (panel_x + 395, panel_y + len(metrics) * 22 + 5),
                  (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    for i, txt in enumerate(metrics):
        cv2.putText(frame, txt, (panel_x, panel_y + i * 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1)

    # ── FPS (top-right) ──────────────────────────────
    fps = driver_state.get("fps", 0)
    cv2.putText(frame, f"FPS: {fps:.0f}", (w - 120, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)


def _draw_calibration_basic(frame, progress, instruction="", reject_reason="", stage_name="FORWARD"):
    """Show calibration progress bar, stage guidance, and any reject reason."""
    h, w = frame.shape[:2]
    cv2.rectangle(frame, (0, 0), (w, 40), (255, 255, 0), -1)
    cv2.putText(frame, "CALIBRATING  —  LOOK FORWARD", (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    # Progress bar
    bar_w = int((w - 40) * progress / 100)
    cv2.rectangle(frame, (20, 50), (20 + bar_w, 65), (0, 255, 0), -1)
    cv2.rectangle(frame, (20, 50), (w - 20, 65), (255, 255, 255), 1)
    cv2.putText(frame, f"{progress}%", (w // 2 - 20, 62),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    cv2.putText(frame, "Neutral face: eyes open, mouth closed, no talking/yawning", (10, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 255, 255), 1)
    if reject_reason:
        cv2.putText(frame, f"Calibration retry: {reject_reason[:65]}", (10, 112),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)


def draw_eye_contours(frame, landmarks, w, h):
    """Draw small circles around eye landmarks for visual feedback."""
    for idx_list, color in [(LEFT_EYE, (0, 255, 0)), (RIGHT_EYE, (0, 255, 0))]:
        pts = [(int(landmarks[i].x * w), int(landmarks[i].y * h)) for i in idx_list]
        for pt in pts:
            cv2.circle(frame, pt, 2, color, -1)


def get_face_bounds(landmarks, w, h):
    coords = np.asarray([(lm.x * w, lm.y * h) for lm in landmarks], dtype=np.float32)
    x_min, y_min = np.min(coords, axis=0)
    x_max, y_max = np.max(coords, axis=0)
    return float(x_min), float(y_min), float(x_max), float(y_max)


def filter_phone_detection_for_driver(phone_result, landmarks, w, h, yaw, attention_meta=None):
    """
    Reject phone detections that are clearly outside the driver's interaction zone.
    This cuts false positives from dashboard objects and other people entering frame.
    """
    context = {
        "phone_in_driver_zone": bool(phone_result.get("phone_detected")),
        "phone_filter_reason": "",
    }
    if not phone_result.get("phone_detected") or phone_result.get("bbox") is None:
        return phone_result, context

    x_min, y_min, x_max, y_max = get_face_bounds(landmarks, w, h)
    face_w = max(40.0, x_max - x_min)
    face_h = max(40.0, y_max - y_min)
    face_cx = (x_min + x_max) / 2.0

    px1, py1, px2, py2 = phone_result["bbox"]
    phone_cx = (float(px1) + float(px2)) / 2.0
    phone_cy = (float(py1) + float(py2)) / 2.0

    zone_x_min = max(0.0, face_cx - face_w * 1.10)
    zone_x_max = min(float(w), face_cx + face_w * 1.35)
    zone_y_min = max(0.0, y_min - face_h * 0.15)
    zone_y_max = min(float(h), y_max + face_h * 2.60)

    in_driver_zone = (
        zone_x_min <= phone_cx <= zone_x_max
        and zone_y_min <= phone_cy <= zone_y_max
    )

    mirror_candidate = bool((attention_meta or {}).get("mirror_candidate", False))
    mirror_band = MIRROR_YAW_THRESHOLD <= abs(float(yaw)) < DISTRACTION_YAW_THRESHOLD
    side_limit = face_w * (1.05 if mirror_candidate and mirror_band else 1.45)
    too_far_side = abs(phone_cx - face_cx) > side_limit
    edge_margin = 0.06 * float(w)
    clipped_to_edge = float(px1) <= edge_margin or float(px2) >= (float(w) - edge_margin)

    reject_reason = ""
    if not in_driver_zone:
        reject_reason = "phone box outside driver zone"
    elif too_far_side and mirror_candidate and mirror_band:
        reject_reason = "mirror glance with phone box far from driver"
    elif clipped_to_edge and too_far_side:
        reject_reason = "phone box anchored at frame edge"

    if not reject_reason:
        return phone_result, context

    filtered = dict(phone_result)
    filtered.update({
        "phone_detected": False,
        "confidence": 0.0,
        "bbox": None,
        "class_name": "",
    })
    context["phone_in_driver_zone"] = False
    context["phone_filter_reason"] = reject_reason
    return filtered, context


def draw_calibration(frame, calibrator):
    """Render the staged calibration overlay using the calibrator state."""
    from config import CALIBRATION_PRE_STABLE_FRAMES

    h, w = frame.shape[:2]
    phase_label = str(getattr(calibrator, "stage_phase", "settle") or "settle").upper()
    title = f"CALIBRATING - {calibrator.current_stage_name.replace('_', ' ')} [{phase_label}]"
    cv2.rectangle(frame, (0, 0), (w, 40), (255, 255, 0), -1)
    cv2.putText(frame, title[:72], (10, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)
    bar_w = int((w - 40) * calibrator.progress / 100)
    cv2.rectangle(frame, (20, 50), (20 + bar_w, 65), (0, 255, 0), -1)
    cv2.rectangle(frame, (20, 50), (w - 20, 65), (255, 255, 255), 1)
    cv2.putText(frame, f"{calibrator.progress}%", (w // 2 - 20, 62),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    if calibrator.instruction:
        cv2.putText(frame, calibrator.instruction[:70], (10, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (0, 255, 255), 1)
    cv2.putText(frame, "Only clean frames count; blinks and jitter are skipped.", (10, 112),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
    cv2.putText(
        frame,
        f"Stage samples: {calibrator.accepted_sample_count}/{calibrator.current_stage_target}  "
        f"Skipped: {calibrator.skipped_frame_count}",
        (10, 134),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (255, 255, 255),
        1,
    )
    cv2.putText(frame, f"Stable gate: {calibrator.stage_stable_count}/{CALIBRATION_PRE_STABLE_FRAMES}", (10, 156),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    cv2.putText(frame, f"Bad frames: {calibrator.stage_bad_frames}", (250, 156),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    if calibrator.last_skip_reason:
        cv2.putText(frame, f"Skip: {calibrator.last_skip_reason[:60]}", (10, 178),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (120, 220, 255), 1)
    if calibrator.last_reject_reason:
        cv2.putText(frame, f"Reason: {calibrator.last_reject_reason[:60]}", (10, 200),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
    if calibrator.pause_required:
        cv2.putText(frame, "Calibration paused - retry the current stage from the app", (10, 222),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)


# ══════════════════════════════════════════════════════════════
#  Main loop
# ══════════════════════════════════════════════════════════════
# ── Display window name ───────────────────────────────────────
WINDOW_NAME = "SISURAKSHA - Driver Monitor"
ALLOW_KEYBOARD_QUIT = sys.stdin.isatty()


def should_quit_from_key(key):
    """Allow quit via ESC always; allow 'q' only in interactive local runs."""
    return key == 27 or (ALLOW_KEYBOARD_QUIT and key == ord('q'))


def update_hold_timer(timer_state, key, active, now):
    """Track how long a condition has stayed continuously active."""
    if active:
        if timer_state[key] is None:
            timer_state[key] = now
        return now - timer_state[key]

    timer_state[key] = None
    return 0.0


def main():
    # Open webcam
    if isinstance(CAMERA_INDEX, int):
        cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap.release()
            cap = cv2.VideoCapture(CAMERA_INDEX)
    else:
        cap = cv2.VideoCapture(CAMERA_INDEX)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

    if not cap.isOpened():
        print("[ERROR] Cannot open webcam. Check CAMERA_INDEX in config.py")
        sys.exit(1)

    print("[INFO] Camera opened successfully. Press 'q' to quit, 'r' to recalibrate.")

    # Listen for runtime commands from Node.js (stdin pipe).
    command_listener_thread = threading.Thread(target=_stdin_command_listener, daemon=True)
    command_listener_thread.start()

    # Start server-related threads only when enabled.
    if SERVER_ENABLED:
        heartbeat_thread = threading.Thread(target=send_heartbeat, daemon=True)
        heartbeat_thread.start()
        alert_sender_thread = threading.Thread(target=_alert_sender_worker, daemon=True)
        alert_sender_thread.start()
        print(f"[INFO] Server heartbeat started → {SERVER_URL}")
    else:
        print("[INFO] Server integration disabled (SERVER_ENABLED=False).")

    # Module instances
    reset_head_pose_smoothing()
    calibrator    = Calibrator()
    drowsiness    = DrowsinessDetector()
    state_machine = StateMachine()
    attention_tracker = GazeAttentionTracker()
    phone_detector = PhoneDetector() if PHONE_ENABLED else None
    event_timers = {
        "mirror_check": None,
        "distracted": None,
        "looking_down": None,
        "high_mar": None,
        "low_ear": None,
    }
    prev_yaw_for_rate = None
    prev_pitch_for_rate = None
    prev_metric_time = None

    calibration_source = "manual"
    calibration_attempt = 1
    calibration_auto_retry_used = False
    manual_retry_required = False
    calibration_active = False
    last_calibration_status = None
    last_retry_event_reason = ""

    def report_calibration_status(status, instruction=None, reject_reason="", skip_reason="", in_progress=None):
        nonlocal last_calibration_status

        payload = {
            "status": status,
            "progress": 100 if status == "COMPLETED" else calibrator.progress,
            "frames_collected": (
                calibrator.total_frames_required if status == "COMPLETED" else calibrator.frames_collected
            ),
            "total_frames": calibrator.total_frames_required,
            "instruction": instruction if instruction is not None else calibrator.instruction,
            "reject_reason": reject_reason,
            "skip_reason": skip_reason,
            "attempt": calibration_attempt,
            "auto_retry_used": calibration_auto_retry_used,
            "source": calibration_source,
            "stage_name": calibrator.current_stage_name if not calibrator.calibrated else "",
            "stage_phase": calibrator.stage_phase,
            "accepted_samples": calibrator.accepted_sample_count if not calibrator.calibrated else 0,
            "skipped_frames": calibrator.skipped_frame_count if not calibrator.calibrated else 0,
            "in_progress": in_progress,
        }

        if payload == last_calibration_status:
            return

        emit_calibration_status(
            status=payload["status"],
            progress=payload["progress"],
            frames_collected=payload["frames_collected"],
            total_frames=payload["total_frames"],
            instruction=payload["instruction"],
            reject_reason=payload["reject_reason"],
            skip_reason=payload["skip_reason"],
            attempt=payload["attempt"],
            auto_retry_used=payload["auto_retry_used"],
            source=payload["source"],
            stage_name=payload["stage_name"],
            stage_phase=payload["stage_phase"],
            accepted_samples=payload["accepted_samples"],
            skipped_frames=payload["skipped_frames"],
            in_progress=payload["in_progress"],
        )
        last_calibration_status = payload

    def reset_calibration(source="manual"):
        nonlocal calibrator
        nonlocal drowsiness
        nonlocal state_machine
        nonlocal attention_tracker
        nonlocal calibration_source
        nonlocal calibration_attempt
        nonlocal calibration_auto_retry_used
        nonlocal manual_retry_required
        nonlocal calibration_active
        nonlocal last_calibration_status
        nonlocal last_retry_event_reason
        nonlocal event_timers
        nonlocal prev_yaw_for_rate
        nonlocal prev_pitch_for_rate
        nonlocal prev_metric_time

        reset_head_pose_smoothing()
        calibrator = Calibrator()
        drowsiness = DrowsinessDetector()
        state_machine = StateMachine()
        attention_tracker = GazeAttentionTracker()
        event_timers = {key: None for key in event_timers}
        prev_yaw_for_rate = None
        prev_pitch_for_rate = None
        prev_metric_time = None

        calibration_source = source
        calibration_attempt = 1
        calibration_auto_retry_used = False
        manual_retry_required = False
        calibration_active = True
        last_calibration_status = None
        last_retry_event_reason = ""
        report_calibration_status("IN_PROGRESS")

    reset_calibration(source="startup")

    prev_time = time.time()
    fps = 0.0
    last_frame_warn = 0.0
    window_initialized = False

    while True:
        while True:
            try:
                command = _command_queue.get_nowait()
            except queue.Empty:
                break

            if command == "recalibrate":
                print("[INFO] Recalibrating from app command — look forward...")
                reset_calibration(source="manual")
            elif command == "retry" and calibrator.pause_required:
                print("[INFO] Retrying paused calibration stage...")
                reset_head_pose_smoothing()
                calibration_attempt += 1
                calibrator.acknowledge_retry()
                manual_retry_required = False
                calibration_auto_retry_used = False
                last_calibration_status = None
                last_retry_event_reason = ""
                report_calibration_status("IN_PROGRESS")

        ret, frame = cap.read()
        if not ret:
            now = time.time()
            if now - last_frame_warn >= 2.0:
                print("[WARN] Frame grab failed — retrying")
                last_frame_warn = now
            continue

        # Resize to configured resolution regardless of camera native resolution.
        # IP webcam streams ignore cap.set() hints and deliver full-resolution frames.
        frame = cv2.resize(frame, (FRAME_WIDTH, FRAME_HEIGHT))

        # Create and size the OpenCV window only after the first valid frame.
        # This avoids showing an empty gray window during camera warm-up.
        if not window_initialized:
            cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(WINDOW_NAME, FRAME_WIDTH, FRAME_HEIGHT)
            window_initialized = True

        h, w = frame.shape[:2]

        # Flip horizontally for mirror-like experience on laptop webcam
        frame = cv2.flip(frame, 1)

        # Convert BGR → RGB for MediaPipe
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)

        face_visible = False
        ear = mar = yaw = pitch = perclos = 0.0
        ear_filtered = 0.0
        ear_confidence = 1.0
        avg_blink_ms = 0.0
        gaze_h, gaze_v = -1.0, -1.0
        gaze_meta = {"gaze_confidence": 0.0, "dominant_eye": "none"}
        attention = "UNKNOWN"
        attention_meta = {}
        is_microsleep = False
        microsleep_elapsed = 0.0
        head_nod_active = False
        head_nod_elapsed = 0.0
        head_nod_drop = 0.0
        yaw_rate = 0.0
        raw_reason = ""
        phone_result = {"phone_detected": False, "confidence": 0.0,
                        "bbox": None, "class_name": "", "inference_ms": 0.0}
        phone_context = {"phone_in_driver_zone": False, "phone_filter_reason": ""}

        # ── Phone detection (runs on full frame) ──────
        if phone_detector and phone_detector.enabled:
            phone_result = phone_detector.detect(frame)

        if results.multi_face_landmarks:
            face_visible = True
            landmarks = results.multi_face_landmarks[0].landmark

            # ── Compute metrics ───────────────────────
            left_pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in LEFT_EYE]
            right_pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in RIGHT_EYE]
            left_span = float(np.linalg.norm(np.array(left_pts[0]) - np.array(left_pts[3])))
            right_span = float(np.linalg.norm(np.array(right_pts[0]) - np.array(right_pts[3])))

            yaw, pitch, roll = get_head_pose(landmarks, w, h)
            ear, ear_confidence = get_dominant_ear(
                landmarks, w, h, yaw, calibrator.max_left_span, calibrator.max_right_span
            )
            mar   = get_mar(landmarks, MOUTH, w, h)

            gaze_h, gaze_v, gaze_meta = get_gaze(landmarks, w, h)
            attention, attention_meta = get_attention_state(
                yaw, pitch, gaze_h, gaze_v,
                calibrator=calibrator,
                tracker=attention_tracker,
                gaze_meta=gaze_meta,
                current_time=time.time(),
            )

            # ── Calibration phase ─────────────────────
            if not calibrator.calibrated:
                if not calibration_active:
                    cv2.putText(frame, "Calibration idle - tap Recalibrate in app", (10, 100),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.62, (0, 255, 255), 2)
                    cv2.putText(frame, "Press 'r' to recalibrate locally", (10, 128),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
                    if DRAW_EYE_CONTOURS:
                        draw_eye_contours(frame, landmarks, w, h)

                    cv2.imshow(WINDOW_NAME, frame)
                    key = cv2.waitKey(1) & 0xFF
                    if should_quit_from_key(key):
                        break
                    elif key == ord('r'):
                        print("[INFO] Recalibrating — look forward...")
                        reset_calibration(source="manual")
                    continue

                if manual_retry_required:
                    draw_calibration(frame, calibrator)
                    cv2.putText(frame, "Calibration paused - tap Retry Stage in app", (10, 134),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)
                    if DRAW_EYE_CONTOURS:
                        draw_eye_contours(frame, landmarks, w, h)

                    cv2.imshow(WINDOW_NAME, frame)
                    key = cv2.waitKey(1) & 0xFF
                    if should_quit_from_key(key):
                        break
                    elif key == ord('r'):
                        print("[INFO] Recalibrating — look forward...")
                        reset_calibration(source="manual")
                    continue

                calibrator.update(
                    ear, yaw, pitch, mar,
                    left_span, right_span,
                    gaze_h=gaze_h, gaze_v=gaze_v,
                    ear_confidence=ear_confidence,
                    gaze_confidence=gaze_meta.get("gaze_confidence", 0.0),
                )
                manual_retry_required = calibrator.pause_required
                calibration_auto_retry_used = calibrator.auto_retry_used > 0
                if not calibrator.last_reject_reason:
                    last_retry_event_reason = ""

                if calibrator.calibrated:
                    calibration_active = False
                    last_retry_event_reason = ""
                    save_calibration_profile(calibrator, CAMERA_INDEX, FRAME_WIDTH, FRAME_HEIGHT)
                    report_calibration_status(
                        "COMPLETED",
                        instruction="Calibration complete. Monitoring resumed.",
                        in_progress=False,
                    )
                elif calibrator.pause_required:
                    last_retry_event_reason = calibrator.last_reject_reason
                    report_calibration_status(
                        "PAUSED",
                        reject_reason=calibrator.last_reject_reason,
                        skip_reason=calibrator.last_skip_reason,
                        in_progress=False,
                    )
                else:
                    if (
                        calibrator.last_reject_reason
                        and calibration_auto_retry_used
                        and calibrator.last_reject_reason != last_retry_event_reason
                    ):
                        last_retry_event_reason = calibrator.last_reject_reason
                        report_calibration_status(
                            "REJECTED",
                            reject_reason=calibrator.last_reject_reason,
                            skip_reason=calibrator.last_skip_reason,
                            in_progress=True,
                        )
                    else:
                        report_calibration_status(
                            "IN_PROGRESS",
                            reject_reason="",
                            skip_reason=calibrator.last_skip_reason,
                        )

                draw_calibration(frame, calibrator)
                if DRAW_EYE_CONTOURS:
                    draw_eye_contours(frame, landmarks, w, h)

                # Show frame and continue
                cv2.imshow(WINDOW_NAME, frame)
                key = cv2.waitKey(1) & 0xFF
                if should_quit_from_key(key):
                    break
                continue

            # ── Post-calibration processing ───────────
            # Subtract baseline so forward-looking = (0, 0)
            yaw   = yaw   - calibrator.baseline_yaw
            pitch = pitch - calibrator.baseline_pitch

            now = time.time()
            attention, attention_meta = get_attention_state(
                yaw, pitch, gaze_h, gaze_v,
                calibrator=calibrator,
                tracker=attention_tracker,
                gaze_meta=gaze_meta,
                current_time=now,
            )
            phone_result, phone_context = filter_phone_detection_for_driver(
                phone_result,
                landmarks,
                w,
                h,
                yaw,
                attention_meta=attention_meta,
            )

            yaw_rate = 0.0
            pitch_rate = 0.0
            if prev_metric_time is not None and prev_yaw_for_rate is not None and prev_pitch_for_rate is not None:
                dt = max(now - prev_metric_time, 1e-3)
                yaw_rate = (yaw - prev_yaw_for_rate) / dt
                pitch_rate = (pitch - prev_pitch_for_rate) / dt
            prev_metric_time = now
            prev_yaw_for_rate = yaw
            prev_pitch_for_rate = pitch

            ear_filtered = drowsiness.filter_ear(ear)
            quality = build_measurement_quality(
                face_visible=True,
                ear_confidence=ear_confidence,
                gaze_confidence=gaze_meta.get("gaze_confidence", 0.0),
                left_span=left_span,
                right_span=right_span,
                calibrator=calibrator,
                yaw_rate=yaw_rate,
                pitch_rate=pitch_rate,
            )
            ear_norm = normalize_ear(calibrator, ear_filtered, yaw, quality.eye_visibility)
            drowsiness.update_ear_history(ear_filtered, weight=quality.overall)
            drowsiness.process_blink(ear_filtered, now, blink_threshold=calibrator.blink_threshold)

            perclos      = drowsiness.get_perclos(calibrator.ear_closed_threshold)
            avg_blink_ms = drowsiness.get_avg_blink_ms()
            is_low_ear_fatigue, low_ear_elapsed = drowsiness.check_low_ear_fatigue(
                ear_norm, quality.level
            )
            slow_blink_detected = drowsiness.is_slow_blinking()
            mirror_protected = attention_meta.get("mirror_protected", False)
            eyes_only_mirror = attention_meta.get("eyes_only_mirror", False)
            mirror_soft_protected = (
                (mirror_protected or eyes_only_mirror or attention_meta.get("mirror_candidate", False))
                and MIRROR_YAW_THRESHOLD <= abs(yaw) < DISTRACTION_YAW_THRESHOLD
                and not attention_meta.get("mirror_overdue", False)
            )
            gaze_confidence = gaze_meta.get("gaze_confidence", 0.0)
            phone_like_downlook = (
                attention == "PHONE IN LAP"
                and gaze_confidence >= GAZE_CONFIDENCE_MIN
                and ear_filtered >= (calibrator.ear_fatigue_threshold + PHONE_LOOK_EAR_OPEN_MARGIN)
            )
            if mirror_soft_protected and abs(yaw) >= MIRROR_YAW_THRESHOLD and ear_confidence < 0.90:
                drowsiness.low_ear_start = None
                is_low_ear_fatigue = False
                low_ear_elapsed = 0.0
            if phone_like_downlook and ear_confidence >= 0.70:
                drowsiness.low_ear_start = None
                is_low_ear_fatigue = False
                low_ear_elapsed = 0.0
            slow_blink = slow_blink_detected or is_low_ear_fatigue
            head_nod_active, head_nod_elapsed, head_nod_drop = drowsiness.check_gradual_head_nod(pitch)
            nod_for_microsleep = head_nod_active and not phone_like_downlook

            distracted_elapsed = update_hold_timer(
                event_timers, "distracted",
                (abs(yaw) >= DISTRACTION_YAW_THRESHOLD or attention == "EYES OFF ROAD") and not mirror_soft_protected,
                now,
            )
            mirror_elapsed = update_hold_timer(
                event_timers, "mirror_check",
                mirror_soft_protected or attention_meta.get("mirror_candidate", False),
                now,
            )
            looking_down_elapsed = update_hold_timer(
                event_timers, "looking_down",
                pitch > PITCH_DOWN_THRESHOLD or phone_like_downlook or attention == "PHONE IN LAP",
                now,
            )
            high_mar_elapsed = update_hold_timer(
                event_timers, "high_mar",
                mar > calibrator.mar_yawn_threshold and not mirror_soft_protected and abs(yaw) < MIRROR_YAW_THRESHOLD,
                now,
            )
            update_hold_timer(
                event_timers, "low_ear",
                ear_norm < 0.82,
                now,
            )

            closed_for_microsleep = max(
                calibrator.ear_closed_threshold,
                calibrator.blink_threshold - 0.03,
            )

            strong_closed_threshold = min(
                closed_for_microsleep - 0.015,
                calibrator.ear_closed_threshold * EAR_STRONG_CLOSED_RATIO,
            )
            microsleep_support = (
                perclos >= HEAD_NOD_MIN_PERCLOS
                or nod_for_microsleep
                or (slow_blink_detected and not mirror_soft_protected and not phone_like_downlook)
            )
            if (mirror_soft_protected or phone_like_downlook) and not nod_for_microsleep and perclos < HEAD_NOD_MIN_PERCLOS:
                microsleep_support = False

            is_microsleep, microsleep_elapsed, microsleep_reason = drowsiness.check_microsleep(
                ear_filtered,
                ear_norm,
                closed_for_microsleep,
                yaw=yaw,
                ear_confidence=ear_confidence,
                support_present=microsleep_support,
                strong_closed_threshold=strong_closed_threshold,
                mirror_protected=mirror_soft_protected,
                quality_level=quality.level,
            )

            # Gradual head droop can be an additional microsleep cue, but only
            # escalate when eye/fatigue evidence is also present.
            if nod_for_microsleep and not mirror_soft_protected:
                nod_eye_confirmed = (
                    is_low_ear_fatigue
                    or ear_norm < 0.92
                    or perclos >= HEAD_NOD_MIN_PERCLOS
                )
                if (not HEAD_NOD_REQUIRE_EYE_FATIGUE) or nod_eye_confirmed:
                    is_microsleep = True
                    microsleep_elapsed = max(microsleep_elapsed, head_nod_elapsed)
                    microsleep_reason = "head nod with supporting eye evidence"

            # ── State determination ───────────────────
            raw_state, stage, color, raw_reason = state_machine.determine_state(
                face_visible=True,
                ear=ear, mar=mar, yaw=yaw, pitch=pitch,
                perclos=perclos,
                is_microsleep=is_microsleep,
                is_slow_blink=slow_blink,
                attention=attention,
                calibrated=True,
                phone_detected=phone_result["phone_detected"],
                mar_threshold=calibrator.mar_yawn_threshold,
                context={
                    "mirror_elapsed": mirror_elapsed,
                    "mirror_candidate": attention_meta.get("mirror_candidate", False),
                    "mirror_protected": mirror_soft_protected,
                    "mirror_soft_protected": mirror_soft_protected,
                    "mirror_overdue": attention_meta.get("mirror_overdue", False),
                    "eyes_only_mirror": eyes_only_mirror,
                    "offroad_by_yaw": abs(yaw) >= DISTRACTION_YAW_THRESHOLD,
                    "distracted_elapsed": distracted_elapsed,
                    "looking_down_elapsed": looking_down_elapsed,
                    "high_mar_elapsed": high_mar_elapsed,
                    "low_ear_elapsed": low_ear_elapsed,
                    "ear_confidence": ear_confidence,
                    "gaze_confidence": gaze_confidence,
                    "phone_like_downlook": phone_like_downlook,
                    "yaw_rate": yaw_rate,
                    "quality_level": quality.level,
                    "quality_reason": quality.reason,
                    "quality_score": quality.overall,
                    "microsleep_reason": microsleep_reason,
                    "phone_in_driver_zone": phone_context.get("phone_in_driver_zone", False),
                },
            )
            smoothed_state = state_machine.get_smoothed_state(raw_state)

            # Re-fetch color for the smoothed state
            stage = state_machine._state_to_stage(smoothed_state)
            color = STAGE_DISPLAY.get(stage, ("", (255, 255, 255)))[1]

            # ── Console debug (print every 15 frames) ─
            if DEBUG_PRINT_EVERY > 0:
                if hasattr(state_machine, '_dbg_ctr'):
                    state_machine._dbg_ctr += 1
                else:
                    state_machine._dbg_ctr = 0
                if state_machine._dbg_ctr % DEBUG_PRINT_EVERY == 0:
                    print(f"[DBG] raw={raw_state:<14} smooth={smoothed_state:<14} "
                          f"EAR={ear:.3f}/{ear_filtered:.3f} MAR={mar:.3f} yaw={yaw:.1f} "
                          f"pitch={pitch:.1f} nod={head_nod_active} dP={head_nod_drop:.2f} "
                          f"PERCLOS={perclos:.1f}% normEAR={ear_norm:.2f} q={quality.level} econf={ear_confidence:.2f} gconf={gaze_confidence:.2f} "
                          f"attn={attention:<13} mirror={mirror_elapsed:.2f}s eyesOnly={eyes_only_mirror} phoneDown={phone_like_downlook} "
                          f"reason={raw_reason} phone={phone_result['phone_detected']}")

            # Draw eye contours
            if DRAW_EYE_CONTOURS:
                draw_eye_contours(frame, landmarks, w, h)

        else:
            # No face detected
            attention_tracker.reset()
            for timer_key in event_timers:
                event_timers[timer_key] = None
            prev_yaw_for_rate = None
            prev_pitch_for_rate = None
            prev_metric_time = None
            ear = 0.0
            ear_confidence = 0.0
            ear_filtered = 0.0
            ear_norm = 0.0
            mar = 0.0
            perclos = 0.0
            yaw = 0.0
            pitch = 0.0
            avg_blink_ms = 0.0
            head_nod_active = False
            head_nod_drop = 0.0
            head_nod_elapsed = 0.0
            gaze_h = 0.0
            gaze_v = 0.0
            gaze_meta = {"gaze_confidence": 0.0, "dominant_eye": "none"}
            attention_meta = {"mirror_elapsed": 0.0}
            attention = "UNKNOWN"
            raw_reason = "no face visible"
            quality = build_measurement_quality(False, 0.0, 0.0, 0.0, 0.0, calibrator, 0.0, 0.0)
            if calibrator.calibrated:
                smoothed_state = "NO FACE"
                stage = 0
                color = (128, 128, 128)
            elif calibration_active:
                report_calibration_status("IN_PROGRESS", skip_reason="no face detected")
                draw_calibration(frame, calibrator)
                cv2.putText(frame, "No face detected — position yourself",
                            (10, 100), cv2.FONT_HERSHEY_SIMPLEX,
                            0.6, (0, 0, 255), 2)
                cv2.imshow(WINDOW_NAME, frame)
                key = cv2.waitKey(1) & 0xFF
                if should_quit_from_key(key):
                    break
                continue
            else:
                cv2.putText(frame, "Calibration idle - tap Recalibrate in app",
                            (10, 100), cv2.FONT_HERSHEY_SIMPLEX,
                            0.62, (0, 255, 255), 2)
                cv2.putText(frame, "Press 'r' to recalibrate locally",
                            (10, 128), cv2.FONT_HERSHEY_SIMPLEX,
                            0.55, (255, 255, 255), 2)
                cv2.imshow(WINDOW_NAME, frame)
                key = cv2.waitKey(1) & 0xFF
                if should_quit_from_key(key):
                    break
                elif key == ord('r'):
                    print("[INFO] Recalibrating — look forward...")
                    reset_calibration(source="manual")
                continue

        # ── FPS calculation ───────────────────────────
        cur_time = time.time()
        fps = 1.0 / (cur_time - prev_time + 1e-6)
        prev_time = cur_time

        # ── Build standardised output dictionary ──────
        driver_state = {
            "state"        : smoothed_state,
            "stage"        : stage,
            "color"        : color,
            "ear"          : round(ear, 4),
            "ear_confidence": round(ear_confidence, 3),
            "ear_filtered" : round(ear_filtered, 4),
            "ear_norm"     : round(ear_norm, 3),
            "mar"          : round(mar, 4),
            "perclos"      : round(perclos, 2),
            "yaw"          : round(yaw, 2),
            "pitch"        : round(pitch, 4),
            "avg_blink_ms" : round(avg_blink_ms, 1),
            "head_nod_active": head_nod_active,
            "head_nod_drop"  : round(head_nod_drop, 3),
            "head_nod_sec"   : round(head_nod_elapsed, 2),
            "gaze_h"       : round(gaze_h, 3),
            "gaze_v"       : round(gaze_v, 3),
            "gaze_confidence": round(gaze_meta.get("gaze_confidence", 0.0), 3),
            "dominant_eye" : gaze_meta.get("dominant_eye", "none"),
            "attention"    : attention,
            "mirror_elapsed": round(attention_meta.get("mirror_elapsed", 0.0), 2),
            "quality_level": quality.level,
            "quality_score": round(quality.overall, 3),
            "reason"       : raw_reason,
            "calibrated"   : calibrator.calibrated,
            "face_visible" : face_visible,
            "fps"          : fps,
            "phone_detected" : phone_result["phone_detected"],
            "phone_conf"     : phone_result["confidence"],
            "phone_infer_ms" : phone_result["inference_ms"],
        }

        # ── Draw overlay ─────────────────────────────
        draw_dashboard(frame, driver_state)

        # ── Send alert to server if state is non-normal ──
        if smoothed_state != "ALERT" and smoothed_state != "CALIBRATING":
            phone_conf = phone_result.get("confidence", 0.0) if phone_result["phone_detected"] else None
            send_alert(
                smoothed_state,
                confidence=phone_conf,
                detection_class=smoothed_state
            )

        # Microsleep flash warning
        if smoothed_state == "MICROSLEEP":
            cv2.rectangle(frame, (0, 0), (w, h), (0, 0, 255), 12)
            cv2.putText(frame, "!! WAKE UP !!", (w // 2 - 130, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 255), 4)

        # Yawning alert
        if smoothed_state == "YAWNING":
            cv2.rectangle(frame, (0, 0), (w, h), (0, 200, 255), 8)
            cv2.putText(frame, "YAWNING DETECTED", (w // 2 - 180, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 200, 255), 3)

        # Drowsy / Fatigued alert
        if smoothed_state == "DROWSY":
            cv2.rectangle(frame, (0, 0), (w, h), (0, 100, 255), 10)
            cv2.putText(frame, "!! DROWSY !!", (w // 2 - 130, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 100, 255), 3)

        if smoothed_state == "FATIGUED":
            cv2.rectangle(frame, (0, 0), (w, h), (0, 200, 255), 6)
            cv2.putText(frame, "FATIGUE DETECTED", (w // 2 - 180, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 200, 255), 3)

        # Looking down alert
        if smoothed_state == "LOOKING DOWN":
            cv2.rectangle(frame, (0, 0), (w, h), (0, 140, 255), 8)
            cv2.putText(frame, "LOOK UP!", (w // 2 - 100, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 140, 255), 3)

        if smoothed_state == "PHONE IN LAP":
            cv2.rectangle(frame, (0, 0), (w, h), (0, 140, 255), 8)
            cv2.putText(frame, "PHONE / LAP LOOK", (w // 2 - 170, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 140, 255), 3)

        # Distracted alert
        if smoothed_state == "DISTRACTED":
            cv2.rectangle(frame, (0, 0), (w, h), (0, 0, 255), 8)
            cv2.putText(frame, "EYES ON ROAD!", (w // 2 - 150, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)

        # Phone detected alert
        if smoothed_state == "PHONE USE":
            cv2.rectangle(frame, (0, 0), (w, h), (0, 0, 255), 10)
            cv2.putText(frame, "!! PUT PHONE DOWN !!", (w // 2 - 220, h // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 0, 255), 4)

        # Draw phone bounding box if detected
        if phone_detector and phone_result["phone_detected"]:
            PhoneDetector.draw_detection(frame, phone_result)

        cv2.imshow(WINDOW_NAME, frame)

        # ── Key handling ──────────────────────────────
        key = cv2.waitKey(1) & 0xFF
        if should_quit_from_key(key) or _stop_event.is_set():
            break
        elif key == ord('r'):
            # Recalibrate
            print("[INFO] Recalibrating — look forward...")
            reset_calibration(source="manual")

    # Cleanup
    if SERVER_ENABLED:
        try:
            _alert_queue.put_nowait(None)
        except queue.Full:
            pass

    cap.release()
    cv2.destroyAllWindows()
    face_mesh.close()
    print("[INFO] Shutdown complete.")
    print(f"       Phone detection was: {'ENABLED' if phone_detector and phone_detector.enabled else 'DISABLED'}")


if __name__ == "__main__":
    main()
