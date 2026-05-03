# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Driver Monitoring System Configuration
# IT22610102 | Pinto R.I.S.R | 25-26J-282
# All tunable constants — never hardcode these inside functions
# ══════════════════════════════════════════════════════════════

# ── Runtime Profiles ─────────────────────────────────────────
LOW_SPEC_MODE       = False   # set False on stronger laptops/desktops

# ── Camera ────────────────────────────────────────────
# For laptop webcam:   CAMERA_INDEX = 0
# For IP Webcam phone: CAMERA_INDEX = "http://192.168.1.XX:8080/video"
# Replace XX with your phone's IP (shown in IP Webcam app)
CAMERA_INDEX        = 0       # laptop webcam for local testing
FRAME_WIDTH         = 480 if LOW_SPEC_MODE else 640
FRAME_HEIGHT        = 360 if LOW_SPEC_MODE else 480

# ── Runtime Behavior ───────────────────────────────────
DRAW_EYE_CONTOURS   = True    # show green eye landmark dots for visual tracking/debug
DEBUG_PRINT_EVERY   = 0 if LOW_SPEC_MODE else 15

# ── Server Integration ─────────────────────────────────
SERVER_ENABLED      = True    # keep enabled so app UI gets live heartbeat + alerts
HEARTBEAT_INTERVAL_SEC = 5.0
ALERT_TIMEOUT_SEC   = 0.5     # short timeout prevents UI stutter when server is offline

# ── MediaPipe ─────────────────────────────────────────
MIN_DETECTION_CONF  = 0.5
MIN_TRACKING_CONF   = 0.5

# ── Calibration ───────────────────────────────────────
CALIBRATION_FRAMES  = 30      # frames to collect for baseline
CALIBRATION_FORWARD_FRAMES = 40
CALIBRATION_SIDE_FRAMES = 25
CALIBRATION_STAGE_WARMUP_FRAMES = 10
CALIBRATION_MAX_EAR_STD = 0.055
CALIBRATION_MAX_YAW_STD = 7.0
CALIBRATION_MAX_PITCH_STD = 8.5
CALIBRATION_MAX_BLINK_RATIO = 0.28
CALIBRATION_MAX_YAWN_RATIO = 0.16
CALIBRATION_PRE_STABLE_FRAMES = 5
CALIBRATION_STAGE_TIMEOUT_SEC = 8.0
CALIBRATION_SIDE_ALIGN_SECONDS = 0.7
CALIBRATION_MAX_AUTO_RETRIES = 1
CALIBRATION_MIN_EYE_SPAN_PX = 18.0
CALIBRATION_GOOD_EAR_CONF_MIN = 0.65
CALIBRATION_GOOD_GAZE_CONF_MIN = 0.45
CALIBRATION_MAX_YAW_RATE = 45.0
CALIBRATION_MAX_PITCH_RATE = 35.0
CALIBRATION_SKIP_BLINK_RATIO = 0.80
CALIBRATION_SKIP_YAWN_RATIO = 1.20
CALIBRATION_FORWARD_HARD_MAX_ABS_YAW = 18.0
CALIBRATION_FORWARD_MAX_BAD_FRAMES = 18
CALIBRATION_SIDE_MAX_BAD_FRAMES = 20
CALIBRATION_STABLE_DECAY_SOFT = 1
CALIBRATION_STABLE_DECAY_MOTION = 2
CALIBRATION_POSE_RATE_MIN_SAMPLES = 4
LEFT_MIRROR_EXPECTED_SIGN = -1
RIGHT_MIRROR_EXPECTED_SIGN = 1
CALIBRATION_DIRECTION_MARGIN_DEG = 4.0

# ── EAR thresholds (derived from baseline after calibration) ──
EAR_FATIGUE_RATIO   = 0.90    # baseline × this = fatigue threshold (tighter: catches drooping earlier)
EAR_CLOSED_RATIO    = 0.78    # baseline × this = closed threshold (microsleep + PERCLOS)
BLINK_EAR_RATIO     = 0.82    # baseline × this = blink detection threshold

# ── Drowsiness ────────────────────────────────────────
MICROSLEEP_SECONDS  = 1.0     # faster microsleep trigger on low-FPS systems
SLOW_BLINK_MS       = 400     # blink duration ms = slow blink (normal 100-300ms, slow 400+)
MIN_BLINKS_TO_JUDGE = 3       # minimum blinks before slow blink decision (faster response)

# ── PERCLOS ───────────────────────────────────────────
PERCLOS_WINDOW_SEC  = 5.0   # seconds (replaces PERCLOS_WINDOW frame count)
PERCLOS_FATIGUED    = 15.0
PERCLOS_DROWSY      = 28.0

# ── MAR / Yawning ─────────────────────────────────────
MAR_YAWN_RATIO      = 1.25    # baseline MAR × this = yawning threshold (lowered to catch yawns reliably)
MAR_SUSTAIN_FRAMES  = 7       # frames MAR must be high to confirm yawn (compensates for IP cam fps)

# ── Head Pose (landmark ratio units; 0.0=forward, ±1.0=extreme) ──
YAW_THRESHOLD       = 25.0    # degrees off-center = general head-turn attention threshold
DISTRACTION_YAW_THRESHOLD = 45.0
PITCH_DOWN_THRESHOLD = 15.0   # degrees = looking down at lap (allow natural downward glance)
PITCH_UP_THRESHOLD  = -15.0   # degrees = looking up
MIRROR_YAW_THRESHOLD = 18.0   # degrees = meaningful side-turn that may be a mirror check
CALIBRATION_NEUTRAL_YAW_MAX = 8.0
MIRROR_CALIBRATION_MIN_YAW = 12.0

# ── Gradual Head-Nod (microsleep assist) ───────────
# Detects a gradual downward head drift; fused with eye-fatigue signals
# to reduce false positives from normal road checks.
HEAD_NOD_WINDOW_SEC   = 1.30 if LOW_SPEC_MODE else 1.00
HEAD_NOD_MIN_DROP     = 5.0 if LOW_SPEC_MODE else 4.0
HEAD_NOD_PITCH_LEVEL  = PITCH_DOWN_THRESHOLD + 5.0
HEAD_NOD_HOLD_SEC     = 0.40 if LOW_SPEC_MODE else 0.32
HEAD_NOD_MIN_PERCLOS  = 10.0
HEAD_NOD_REQUIRE_EYE_FATIGUE = True

# ── Output smoothing ────────────────────────────
SMOOTH_BUFFER_SIZE  = 5       # frames for state smoothing (higher = more stable)

DISTRACTED_CONFIRM_SECONDS   = 0.8
LOOKING_DOWN_CONFIRM_SECONDS = 0.6
YAWNING_CONFIRM_SECONDS      = 0.5
MIRROR_MIN_SECONDS           = 0.25
MIRROR_MAX_SECONDS           = 1.2
MIRROR_GRACE_SECONDS         = 0.35

# ── Iris / Gaze (future implementation) ───────────────
GAZE_CENTER_MIN     = 0.35
GAZE_CENTER_MAX     = 0.65
GAZE_DOWN_THRESHOLD = 0.65
IRIS_ENABLED        = True    # set True when iris implementation is complete
GAZE_MIRROR_DELTA_MIN = 0.08
GAZE_MIRROR_DELTA_MAX = 0.30
GAZE_EYES_OFF_ROAD_DELTA = 0.18
GAZE_PHONE_DOWN_DELTA = 0.12
GAZE_CONFIDENCE_MIN = 0.45
GAZE_PUPIL_CONFIDENCE_STRONG = 0.60
EYES_ONLY_MIRROR_MAX_YAW = 12.0
EYES_ONLY_MIRROR_MIN_GAZE_DELTA = 0.10
EYES_ONLY_MIRROR_HOLD_SECONDS = 0.10
QUALITY_FACE_SIZE_MIN = 0.0
QUALITY_EAR_CONF_STRONG = 0.70
QUALITY_EAR_CONF_MIN = 0.45
QUALITY_GAZE_CONF_STRONG = 0.60
QUALITY_GAZE_CONF_MIN = 0.45
QUALITY_VISIBILITY_MIN = 0.55
EAR_SIDE_COMPENSATION_MAX = 0.14
EAR_YAW_REF_DEG = 35.0
MICROSLEEP_ENTRY_SECONDS = 1.0
MICROSLEEP_EXIT_OPEN_FRAMES = 3
FATIGUE_ENTRY_SECONDS = 0.8
DISTRACTION_EXIT_GRACE_SECONDS = 0.25
LOOKING_DOWN_EXIT_GRACE_SECONDS = 0.20

# ── Landmark Indices ──────────────────────────────────
LEFT_EYE   = [362, 385, 387, 263, 373, 380]
RIGHT_EYE  = [33, 160, 158, 133, 153, 144]
LEFT_EYE_10  = [362, 398, 384, 385, 386, 387, 388, 466, 373, 380]
RIGHT_EYE_10 = [33,  246, 161, 160, 159, 158, 157, 173, 153, 144]
EAR_EXTENDED = True
# Mouth landmarks — 6 points forming an ellipse (same pattern as eyes)
# p1=78 left corner, p2=0 upper lip top, p3=11 upper lip mid
# p4=308 right corner, p5=16 lower lip mid, p6=17 lower lip bottom
MOUTH      = [78, 0, 11, 308, 16, 17]

NOSE_TIP         = 1
LEFT_FACE        = 234
RIGHT_FACE       = 454
LEFT_EYE_CENTER  = 33
RIGHT_EYE_CENTER = 263
CHIN             = 152

# ── Iris Landmark Indices ─────────────────────────────
LEFT_IRIS_CENTER   = 468
RIGHT_IRIS_CENTER  = 473
LEFT_IRIS_RING     = [468, 469, 470, 471, 472]
RIGHT_IRIS_RING    = [473, 474, 475, 476, 477]

LEFT_EYE_LEFT_CORNER   = 33
LEFT_EYE_RIGHT_CORNER  = 133
LEFT_EYE_TOP           = 159
LEFT_EYE_BOTTOM        = 145

RIGHT_EYE_LEFT_CORNER  = 362
RIGHT_EYE_RIGHT_CORNER = 263
RIGHT_EYE_TOP          = 386
RIGHT_EYE_BOTTOM       = 374

EAR_MIN_VISIBILITY = 0.55
EAR_STRONG_CLOSED_RATIO = 0.70
EAR_CONFIDENCE_MIN_FOR_DROWSINESS = 0.45
PHONE_LOOK_EAR_OPEN_MARGIN = 0.015

# ── Phone Detection (YOLOv8n ONNX) ────────────────────
import os as _os
PHONE_MODEL_PATH     = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "best.pt")
PHONE_CONF_THRESHOLD = 0.40    # lower threshold for real-world phone-use detection
PHONE_NMS_THRESHOLD  = 0.45    # NMS IoU threshold
PHONE_INPUT_SIZE     = 224 if LOW_SPEC_MODE else 320
PHONE_SKIP_FRAMES    = 4 if LOW_SPEC_MODE else 2
PHONE_PERSIST_FRAMES = 12      # keep "phone detected" for N frames after last hit
PHONE_CLASS_NAMES    = ["phone_use"]      # class index → name (single-class model)
PHONE_USE_CLASS_ID   = 0                  # index of the phone class
PHONE_ENABLED        = True    # master switch for phone detection

# ── Stage Display ─────────────────────────────────────
# stage_id → (label, BGR colour)
STAGE_DISPLAY = {
    0: ("ALERT",        (0, 255, 0)),       # green
    1: ("FATIGUED",     (0, 200, 255)),     # light orange
    2: ("DROWSY",       (0, 100, 255)),     # orange
    3: ("MICROSLEEP",   (0, 0, 255)),       # red
    4: ("YAWNING",      (0, 220, 255)),     # yellow-orange
    5: ("DISTRACTED",   (0, 0, 255)),       # red
    6: ("LOOKING DOWN", (0, 140, 255)),     # dark orange
    7: ("PHONE USE",    (255, 0, 255)),     # magenta
    8: ("EYES OFF ROAD",(0, 80, 255)),      # deep orange
    9: ("NO FACE",      (128, 128, 128)),   # grey
}
