# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Iris Gaze Module (Stub)
# Returns placeholder values until iris tracking is implemented.
# refine_landmarks=True is already set in main.py — the landmark
# infrastructure is ready, only the logic needs activation.
# ══════════════════════════════════════════════════════════════

from config import (
    IRIS_ENABLED,
    LEFT_IRIS_CENTER, RIGHT_IRIS_CENTER,
    LEFT_EYE_LEFT_CORNER, LEFT_EYE_RIGHT_CORNER,
    LEFT_EYE_TOP, LEFT_EYE_BOTTOM,
    RIGHT_EYE_LEFT_CORNER, RIGHT_EYE_RIGHT_CORNER,
    RIGHT_EYE_TOP, RIGHT_EYE_BOTTOM,
    GAZE_CENTER_MIN, GAZE_CENTER_MAX, GAZE_DOWN_THRESHOLD,
    YAW_THRESHOLD
)


def get_gaze(landmarks, w, h):
    """
    Returns (gaze_horizontal, gaze_vertical).
    Currently returns (-1, -1) as a stub.
    When IRIS_ENABLED is True, computes actual gaze ratios.
    """
    if not IRIS_ENABLED:
        return -1.0, -1.0

    # Left eye horizontal gaze
    left_iris      = landmarks[LEFT_IRIS_CENTER]
    left_eye_left  = landmarks[LEFT_EYE_LEFT_CORNER]
    left_eye_right = landmarks[LEFT_EYE_RIGHT_CORNER]
    left_width     = abs(left_eye_right.x - left_eye_left.x)
    left_gaze_h    = (left_iris.x - left_eye_left.x) / (left_width + 1e-6)

    # Right eye horizontal gaze
    right_iris      = landmarks[RIGHT_IRIS_CENTER]
    right_eye_left  = landmarks[RIGHT_EYE_LEFT_CORNER]
    right_eye_right = landmarks[RIGHT_EYE_RIGHT_CORNER]
    right_width     = abs(right_eye_right.x - right_eye_left.x)
    right_gaze_h    = (right_iris.x - right_eye_left.x) / (right_width + 1e-6)

    # Left eye vertical gaze
    left_eye_top    = landmarks[LEFT_EYE_TOP]
    left_eye_bottom = landmarks[LEFT_EYE_BOTTOM]
    left_height     = abs(left_eye_bottom.y - left_eye_top.y)
    left_gaze_v     = (left_iris.y - left_eye_top.y) / (left_height + 1e-6)

    # Right eye vertical gaze
    right_eye_top    = landmarks[RIGHT_EYE_TOP]
    right_eye_bottom = landmarks[RIGHT_EYE_BOTTOM]
    right_height     = abs(right_eye_bottom.y - right_eye_top.y)
    right_gaze_v     = (right_iris.y - right_eye_top.y) / (right_height + 1e-6)

    gaze_h = (left_gaze_h + right_gaze_h) / 2.0
    gaze_v = (left_gaze_v + right_gaze_v) / 2.0

    return gaze_h, gaze_v


def get_attention_state(yaw, pitch, gaze_h, gaze_v):
    """
    Combine head pose and iris gaze to determine attention state.
    Returns "UNKNOWN" when iris tracking is not enabled.
    """
    if not IRIS_ENABLED:
        return "UNKNOWN"

    head_forward  = abs(yaw) < YAW_THRESHOLD
    eyes_centered = GAZE_CENTER_MIN < gaze_h < GAZE_CENTER_MAX
    eyes_down     = gaze_v > GAZE_DOWN_THRESHOLD

    if head_forward and eyes_down:
        return "PHONE IN LAP"
    if head_forward and not eyes_centered:
        return "EYES OFF ROAD"
    if not head_forward and not eyes_centered:
        return "DISTRACTED"
    if not head_forward and eyes_centered:
        return "MIRROR CHECK"

    return "ALERT"
