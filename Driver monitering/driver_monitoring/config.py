# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Driver Monitoring System Configuration
# IT22610102 | Pinto R.I.S.R | 25-26J-282
# All tunable constants — never hardcode these inside functions
# ══════════════════════════════════════════════════════════════

# ── Runtime Profiles ─────────────────────────────────────────
LOW_SPEC_MODE       = True    # set False on stronger laptops/desktops

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
SERVER_ENABLED      = False   # disable server calls during local low-spec testing
HEARTBEAT_INTERVAL_SEC = 5.0
ALERT_TIMEOUT_SEC   = 0.5     # short timeout prevents UI stutter when server is offline

# ── MediaPipe ─────────────────────────────────────────
MIN_DETECTION_CONF  = 0.5
MIN_TRACKING_CONF   = 0.5

# ── Calibration ───────────────────────────────────────
CALIBRATION_FRAMES  = 30      # frames to collect for baseline

# ── EAR thresholds (derived from baseline after calibration) ──
EAR_FATIGUE_RATIO   = 0.90    # baseline × this = fatigue threshold (tighter: catches drooping earlier)
EAR_CLOSED_RATIO    = 0.78    # baseline × this = closed threshold (microsleep + PERCLOS)
BLINK_EAR_RATIO     = 0.82    # baseline × this = blink detection threshold

# ── Drowsiness ────────────────────────────────────────
MICROSLEEP_SECONDS  = 1.0     # faster microsleep trigger on low-FPS systems
SLOW_BLINK_MS       = 400     # blink duration ms = slow blink (normal 100-300ms, slow 400+)
MIN_BLINKS_TO_JUDGE = 3       # minimum blinks before slow blink decision (faster response)

# ── PERCLOS ───────────────────────────────────────────
PERCLOS_WINDOW      = 75 if LOW_SPEC_MODE else 150   # frame-based window; shorter on low FPS
PERCLOS_FATIGUED    = 15.0
PERCLOS_DROWSY      = 28.0

# ── MAR / Yawning ─────────────────────────────────────
MAR_YAWN_RATIO      = 1.25    # baseline MAR × this = yawning threshold (lowered to catch yawns reliably)
MAR_SUSTAIN_FRAMES  = 7       # frames MAR must be high to confirm yawn (compensates for IP cam fps)

# ── Head Pose (landmark ratio units; 0.0=forward, ±1.0=extreme) ──
YAW_THRESHOLD       = 0.45    # ratio off-center = distracted (wider for bus mirror checks)
PITCH_DOWN_THRESHOLD = 0.35   # ratio = looking down at lap (allow natural downward glance)
PITCH_UP_THRESHOLD  = -0.30   # ratio = looking up

# ── Gradual Head-Nod (microsleep assist) ───────────
# Detects a gradual downward head drift; fused with eye-fatigue signals
# to reduce false positives from normal road checks.
HEAD_NOD_WINDOW_SEC   = 1.30 if LOW_SPEC_MODE else 1.00
HEAD_NOD_MIN_DROP     = 0.13 if LOW_SPEC_MODE else 0.11
HEAD_NOD_PITCH_LEVEL  = PITCH_DOWN_THRESHOLD + 0.08
HEAD_NOD_HOLD_SEC     = 0.40 if LOW_SPEC_MODE else 0.32
HEAD_NOD_MIN_PERCLOS  = 10.0
HEAD_NOD_REQUIRE_EYE_FATIGUE = True

# ── Output smoothing ────────────────────────────
SMOOTH_BUFFER_SIZE  = 5       # frames for state smoothing (higher = more stable)

# ── Iris / Gaze (future implementation) ───────────────
GAZE_CENTER_MIN     = 0.35
GAZE_CENTER_MAX     = 0.65
GAZE_DOWN_THRESHOLD = 0.65
IRIS_ENABLED        = False   # set True when iris implementation is complete

# ── Landmark Indices ──────────────────────────────────
LEFT_EYE   = [362, 385, 387, 263, 373, 380]
RIGHT_EYE  = [33, 160, 158, 133, 153, 144]
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

LEFT_EYE_LEFT_CORNER   = 33
LEFT_EYE_RIGHT_CORNER  = 133
LEFT_EYE_TOP           = 159
LEFT_EYE_BOTTOM        = 145

RIGHT_EYE_LEFT_CORNER  = 362
RIGHT_EYE_RIGHT_CORNER = 263
RIGHT_EYE_TOP          = 386
RIGHT_EYE_BOTTOM       = 374

# ── Phone Detection (YOLOv8n ONNX) ────────────────────
import os as _os
PHONE_MODEL_PATH     = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "best.pt")
PHONE_CONF_THRESHOLD = 0.25    # lower threshold for real-world phone-use detection
PHONE_NMS_THRESHOLD  = 0.45    # NMS IoU threshold
PHONE_INPUT_SIZE     = 224 if LOW_SPEC_MODE else 320
PHONE_SKIP_FRAMES    = 4 if LOW_SPEC_MODE else 2
PHONE_PERSIST_FRAMES = 20      # keep "phone detected" for N frames after last hit
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
