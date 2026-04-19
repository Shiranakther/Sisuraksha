# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Face Metrics Module
# EAR, MAR from MediaPipe landmarks
# Head pose via robust multi-landmark geometry
# ══════════════════════════════════════════════════════════════

import numpy as np
from config import LEFT_EYE, RIGHT_EYE

# ── EMA smoothing state (module-level) ──
_EMA_ALPHA = 0.40    # slightly more responsive head pose tracking
_smooth_yaw   = 0.0
_smooth_pitch = 0.0
_smooth_roll  = 0.0
_ema_init = False


# ══════════════════════════════════════════════════════════════
#  Head Pose — Multi-Landmark Geometry Method
# ══════════════════════════════════════════════════════════════
#
# Key insight: instead of 3D model fitting (solvePnP) which fails at oblique
# angles, we measure face asymmetry directly from 2D landmarks.
#
# YAW  (left/right): compare eye-to-nose distances on each side.
#   When head turns right, the RIGHT eye-nose gap appears wider.
# PITCH (up/down):   compare nose-to-chin vs nose-to-forehead distances.
#   When head tilts down, the chin appears closer to nose than forehead.
# ROLL (tilt):       measure the slope of the eye-to-eye axis.

_NOSE_TIP       = 1
_LEFT_EYE_IN    = 133   # inner corner of left eye
_RIGHT_EYE_IN   = 362   # inner corner of right eye
_LEFT_EYE_OUT   = 33    # outer corner of left eye
_RIGHT_EYE_OUT  = 263   # outer corner of right eye
_CHIN           = 152
_FOREHEAD       = 10    # forehead centre point
_FACE_LEFT      = 234   # left face boundary
_FACE_RIGHT     = 454   # right face boundary


def get_head_pose(landmarks, w, h):
    """
    Compute head pose from face landmark geometry.
    Returns (yaw, pitch, roll) all in a normalised ±1 scale
    suitable for comparison against calibrated thresholds.

    After calibration the main loop subtracts the baseline,
    so forward-looking always = (0, 0, 0).
    """
    global _smooth_yaw, _smooth_pitch, _smooth_roll, _ema_init

    def pt(idx):
        return np.array([landmarks[idx].x * w, landmarks[idx].y * h])

    nose      = pt(_NOSE_TIP)
    left_eye  = pt(_LEFT_EYE_IN)
    right_eye = pt(_RIGHT_EYE_IN)
    left_out  = pt(_LEFT_EYE_OUT)
    right_out = pt(_RIGHT_EYE_OUT)
    chin      = pt(_CHIN)
    forehead  = pt(_FOREHEAD)
    face_l    = pt(_FACE_LEFT)
    face_r    = pt(_FACE_RIGHT)

    # ── YAW: asymmetry of nose relative to face width ─────
    # face_center_x is the midpoint of the two cheekbones
    face_center_x = (face_l[0] + face_r[0]) / 2.0
    face_width    = abs(face_r[0] - face_l[0]) + 1e-6
    # normalise so ±1 ≈ extreme turn, 0 = facing camera
    raw_yaw = (nose[0] - face_center_x) / (face_width * 0.5)

    # ── PITCH: nose position relative to eye-chin span ────
    eye_mid_y   = (left_eye[1] + right_eye[1]) / 2.0
    face_height = abs(chin[1] - forehead[1]) + 1e-6
    # positive = looking down (nose below eye level)
    raw_pitch = (nose[1] - eye_mid_y) / (face_height * 0.5)

    # ── ROLL: slope of the eye axis ───────────────────────
    eye_dx = right_out[0] - left_out[0] + 1e-6
    eye_dy = right_out[1] - left_out[1]
    raw_roll = eye_dy / eye_dx   # ≈ tan(roll_angle)

    # ── EMA smoothing ─────────────────────────────────────
    if not _ema_init:
        _smooth_yaw, _smooth_pitch, _smooth_roll = raw_yaw, raw_pitch, raw_roll
        _ema_init = True
    else:
        _smooth_yaw   = _EMA_ALPHA * raw_yaw   + (1 - _EMA_ALPHA) * _smooth_yaw
        _smooth_pitch = _EMA_ALPHA * raw_pitch + (1 - _EMA_ALPHA) * _smooth_pitch
        _smooth_roll  = _EMA_ALPHA * raw_roll  + (1 - _EMA_ALPHA) * _smooth_roll

    return _smooth_yaw, _smooth_pitch, _smooth_roll


# ══════════════════════════════════════════════════════════════
#  EAR / MAR — unchanged
# ══════════════════════════════════════════════════════════════

def get_ear(landmarks, eye_points, w, h):
    """Eye Aspect Ratio for one eye."""
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in eye_points]
    v1 = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    v2 = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    h1 = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
    return (v1 + v2) / (2.0 * h1 + 1e-6)


def get_dominant_ear(landmarks, w, h, yaw=0.0):
    """
    Returns average EAR for head-on.
    For oblique angles, uses a weighted near-eye strategy that still allows
    both-eye closure to pull EAR down for microsleep detection.
    """
    ear_left  = get_ear(landmarks, LEFT_EYE, w, h)
    ear_right = get_ear(landmarks, RIGHT_EYE, w, h)

    # At stronger turns, the far eye gets geometrically compressed; lean toward
    # the larger/near-eye EAR, but keep some contribution from the other eye.
    if abs(yaw) > 0.35:
        near_eye = max(ear_left, ear_right)
        far_eye = min(ear_left, ear_right)
        return 0.75 * near_eye + 0.25 * far_eye

    return (ear_left + ear_right) / 2.0


def get_mar(landmarks, mouth_points, w, h):
    """Mouth Aspect Ratio."""
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in mouth_points]
    v1 = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    v2 = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    h1 = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
    return (v1 + v2) / (2.0 * h1 + 1e-6)
