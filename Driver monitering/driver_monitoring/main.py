# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Driver Monitoring System  (Main Loop)
# IT22610102 | Pinto R.I.S.R | 25-26J-282
#
# Webcam-based driver monitoring using MediaPipe Face Mesh.
# Detects: drowsiness, yawning, distraction, microsleep.
# Press 'q' to quit.  Press 'r' to recalibrate.
# ══════════════════════════════════════════════════════════════

import sys
import time
import threading
import queue
import cv2
import numpy as np
import mediapipe as mp
import requests
from datetime import datetime

from config import (
    CAMERA_INDEX, FRAME_WIDTH, FRAME_HEIGHT,
    MIN_DETECTION_CONF, MIN_TRACKING_CONF,
    LEFT_EYE, RIGHT_EYE, MOUTH,
    STAGE_DISPLAY, PHONE_ENABLED, IRIS_ENABLED,
    SERVER_ENABLED, HEARTBEAT_INTERVAL_SEC, ALERT_TIMEOUT_SEC,
    DEBUG_PRINT_EVERY, DRAW_EYE_CONTOURS,
    HEAD_NOD_MIN_PERCLOS, HEAD_NOD_REQUIRE_EYE_FATIGUE,
)
from face_metrics import get_dominant_ear, get_mar, get_head_pose
from iris_gaze import get_gaze, get_attention_state
from drowsiness import DrowsinessDetector
from calibration import Calibrator
from state_machine import StateMachine
from phone_detector import PhoneDetector


# ══════════════════════════════════════════════════════════════
#  Server Integration Configuration
# ══════════════════════════════════════════════════════════════
SERVER_URL = "http://localhost:5000/api/driver-monitor"
DRIVER_ID = "8c394627-e397-4bd5-928f-4cc66cfebac1"

# Alert cooldown tracking
_last_alert_time = {}
ALERT_COOLDOWN = 5  # seconds between same alert type
_alert_queue = queue.Queue(maxsize=64)
_last_heartbeat_error_log = 0.0
_last_alert_error_log = 0.0

# Map driver states to alert types for the server
STATE_TO_ALERT = {
    "DROWSY":       {"alert_type": "drowsy",       "severity": "DANGER",  "sound": True},
    "MICROSLEEP":   {"alert_type": "microsleep",   "severity": "DANGER",  "sound": True},
    "FATIGUED":     {"alert_type": "fatigue",       "severity": "WARNING", "sound": False},
    "YAWNING":      {"alert_type": "yawning",       "severity": "WARNING", "sound": False},
    "DISTRACTED":   {"alert_type": "looking_away",  "severity": "WARNING", "sound": True},
    "LOOKING DOWN": {"alert_type": "looking_away",  "severity": "WARNING", "sound": False},
    "PHONE USE":    {"alert_type": "phone_use",     "severity": "DANGER",  "sound": True},
    "EYES OFF ROAD":{"alert_type": "looking_away",  "severity": "WARNING", "sound": True},
    "NO FACE":      {"alert_type": "no_face",       "severity": "WARNING", "sound": False},
}


def send_heartbeat():
    """Send heartbeat every 5 seconds to keep system status online."""
    global _last_heartbeat_error_log

    if not SERVER_ENABLED:
        return

    while True:
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
        time.sleep(HEARTBEAT_INTERVAL_SEC)


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
        f"MAR:      {driver_state['mar']:.3f}",
        f"PERCLOS:  {driver_state['perclos']:.1f}%",
        f"Yaw:      {driver_state['yaw']:.1f}",
        f"Pitch:    {driver_state['pitch']:.2f}",
        f"Nod:      {'YES' if driver_state.get('head_nod_active') else 'No '}  dP={driver_state.get('head_nod_drop', 0.0):.2f}",
        f"Blink ms: {driver_state['avg_blink_ms']:.0f}",
        f"Gaze H/V: {driver_state['gaze_h']:.2f} / {driver_state['gaze_v']:.2f}",
        f"Phone:    {'YES ' + str(driver_state.get('phone_conf', 0)) if driver_state.get('phone_detected') else 'No'}",
    ]
    panel_height = len(metrics) * 22 + 20
    panel_y = max(18, h - panel_height)

    # Semi-transparent background
    overlay = frame.copy()
    cv2.rectangle(overlay, (panel_x - 5, panel_y - 15),
                  (panel_x + 310, panel_y + len(metrics) * 22 + 5),
                  (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    for i, txt in enumerate(metrics):
        cv2.putText(frame, txt, (panel_x, panel_y + i * 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.50, (255, 255, 255), 1)

    # ── FPS (top-right) ──────────────────────────────
    fps = driver_state.get("fps", 0)
    cv2.putText(frame, f"FPS: {fps:.0f}", (w - 120, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)


def draw_calibration(frame, progress, reject_reason=""):
    """Show calibration progress bar, neutral-face guidance, and any reject reason."""
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


# ══════════════════════════════════════════════════════════════
#  Main loop
# ══════════════════════════════════════════════════════════════
# ── Display window name ───────────────────────────────────────
WINDOW_NAME = "SISURAKSHA — Driver Monitor"


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

    # Create a named window at the configured display resolution.
    # WINDOW_NORMAL allows the user to resize manually afterwards.
    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(WINDOW_NAME, FRAME_WIDTH, FRAME_HEIGHT)

    print("[INFO] Camera opened successfully. Press 'q' to quit, 'r' to recalibrate.")

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
    calibrator    = Calibrator()
    drowsiness    = DrowsinessDetector()
    state_machine = StateMachine()
    phone_detector = PhoneDetector() if PHONE_ENABLED else None

    prev_time = time.time()
    fps = 0.0
    last_frame_warn = 0.0

    while True:
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
        h, w = frame.shape[:2]

        # Flip horizontally for mirror-like experience on laptop webcam
        frame = cv2.flip(frame, 1)

        # Convert BGR → RGB for MediaPipe
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)

        face_visible = False
        ear = mar = yaw = pitch = perclos = 0.0
        ear_filtered = 0.0
        avg_blink_ms = 0.0
        gaze_h, gaze_v = -1.0, -1.0
        attention = "UNKNOWN"
        is_microsleep = False
        microsleep_elapsed = 0.0
        head_nod_active = False
        head_nod_elapsed = 0.0
        head_nod_drop = 0.0
        phone_result = {"phone_detected": False, "confidence": 0.0,
                        "bbox": None, "class_name": "", "inference_ms": 0.0}

        # ── Phone detection (runs on full frame) ──────
        if phone_detector and phone_detector.enabled:
            phone_result = phone_detector.detect(frame)

        if results.multi_face_landmarks:
            face_visible = True
            landmarks = results.multi_face_landmarks[0].landmark

            # ── Compute metrics ───────────────────────
            yaw, pitch, roll = get_head_pose(landmarks, w, h)
            ear   = get_dominant_ear(landmarks, w, h, yaw)
            mar   = get_mar(landmarks, MOUTH, w, h)

            # Iris gaze (stub returns -1, -1 / "UNKNOWN")
            gaze_h, gaze_v = get_gaze(landmarks, w, h)
            attention = get_attention_state(yaw, pitch, gaze_h, gaze_v)

            # ── Calibration phase ─────────────────────
            if not calibrator.calibrated:
                calibrator.update(ear, yaw, pitch, mar)
                draw_calibration(frame, calibrator.progress, calibrator.last_reject_reason)
                if DRAW_EYE_CONTOURS:
                    draw_eye_contours(frame, landmarks, w, h)

                # Show frame and continue
                cv2.imshow(WINDOW_NAME, frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                continue

            # ── Post-calibration processing ───────────
            # Subtract baseline so forward-looking = (0, 0)
            yaw   = yaw   - calibrator.baseline_yaw
            pitch = pitch - calibrator.baseline_pitch

            now = time.time()
            ear_filtered = drowsiness.filter_ear(ear)
            drowsiness.update_ear_history(ear_filtered)
            drowsiness.process_blink(ear_filtered, now, blink_threshold=calibrator.blink_threshold)

            perclos      = drowsiness.get_perclos(calibrator.ear_closed_threshold)
            avg_blink_ms = drowsiness.get_avg_blink_ms()
            is_low_ear_fatigue, _ = drowsiness.check_low_ear_fatigue(
                ear_filtered, calibrator.ear_fatigue_threshold
            )
            slow_blink   = drowsiness.is_slow_blinking() or is_low_ear_fatigue
            head_nod_active, head_nod_elapsed, head_nod_drop = drowsiness.check_gradual_head_nod(pitch)

            closed_for_microsleep = max(
                calibrator.ear_closed_threshold,
                calibrator.blink_threshold - 0.03,
            )

            is_microsleep, microsleep_elapsed = drowsiness.check_microsleep(
                ear_filtered, closed_for_microsleep
            )

            # Gradual head droop can be an additional microsleep cue, but only
            # escalate when eye/fatigue evidence is also present.
            if head_nod_active:
                nod_eye_confirmed = (
                    is_low_ear_fatigue
                    or ear_filtered < (calibrator.ear_fatigue_threshold + 0.01)
                    or perclos >= HEAD_NOD_MIN_PERCLOS
                )
                if (not HEAD_NOD_REQUIRE_EYE_FATIGUE) or nod_eye_confirmed:
                    is_microsleep = True
                    microsleep_elapsed = max(microsleep_elapsed, head_nod_elapsed)

            # ── State determination ───────────────────
            raw_state, stage, color = state_machine.determine_state(
                face_visible=True,
                ear=ear, mar=mar, yaw=yaw, pitch=pitch,
                perclos=perclos,
                is_microsleep=is_microsleep,
                is_slow_blink=slow_blink,
                attention=attention,
                calibrated=True,
                phone_detected=phone_result["phone_detected"],
                mar_threshold=calibrator.mar_yawn_threshold,
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
                          f"PERCLOS={perclos:.1f}% "
                          f"phone={phone_result['phone_detected']}")

            # Draw eye contours
            if DRAW_EYE_CONTOURS:
                draw_eye_contours(frame, landmarks, w, h)

        else:
            # No face detected
            if calibrator.calibrated:
                smoothed_state = "NO FACE"
                stage = 0
                color = (128, 128, 128)
            else:
                draw_calibration(frame, calibrator.progress, calibrator.last_reject_reason)
                cv2.putText(frame, "No face detected — position yourself",
                            (10, 100), cv2.FONT_HERSHEY_SIMPLEX,
                            0.6, (0, 0, 255), 2)
                cv2.imshow(WINDOW_NAME, frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
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
            "ear_filtered" : round(ear_filtered, 4),
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
            "attention"    : attention,
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
        if key == ord('q'):
            break
        elif key == ord('r'):
            # Recalibrate
            print("[INFO] Recalibrating — look forward...")
            calibrator = Calibrator()
            drowsiness = DrowsinessDetector()
            state_machine = StateMachine()

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
