import cv2
import numpy as np

from config import EAR_MIN_VISIBILITY, LEFT_EYE, RIGHT_EYE

_EMA_ALPHA = 0.30
_MAX_POSE_JUMP_DEG = 18.0
_smooth_yaw = 0.0
_smooth_pitch = 0.0
_smooth_roll = 0.0
_ema_init = False

FACE_3D_MODEL = np.array([
    [0.0, 0.0, 0.0],
    [0.0, -63.6, -12.5],
    [-43.3, 32.7, -26.0],
    [43.3, 32.7, -26.0],
    [-28.9, -28.9, -24.1],
    [28.9, -28.9, -24.1],
], dtype=np.float64)


def reset_head_pose_smoothing():
    """Clear the module-level pose EMA used by get_head_pose()."""
    global _smooth_yaw, _smooth_pitch, _smooth_roll, _ema_init
    _smooth_yaw = 0.0
    _smooth_pitch = 0.0
    _smooth_roll = 0.0
    _ema_init = False


def _safe_previous_pose():
    if _ema_init:
        return _smooth_yaw, _smooth_pitch, _smooth_roll
    return 0.0, 0.0, 0.0


def get_head_pose(landmarks, w, h):
    """
    Compute 3D head pose using cv2.solvePnP.
    Returns (yaw, pitch, roll) in degrees.
    """
    global _smooth_yaw, _smooth_pitch, _smooth_roll, _ema_init

    image_points = np.array([
        [landmarks[1].x * w, landmarks[1].y * h],
        [landmarks[152].x * w, landmarks[152].y * h],
        [landmarks[33].x * w, landmarks[33].y * h],
        [landmarks[263].x * w, landmarks[263].y * h],
        [landmarks[61].x * w, landmarks[61].y * h],
        [landmarks[291].x * w, landmarks[291].y * h],
    ], dtype=np.float64)

    fx = float(max(w, h))
    camera_matrix = np.array([
        [fx, 0.0, w / 2.0],
        [0.0, fx, h / 2.0],
        [0.0, 0.0, 1.0],
    ], dtype=np.float64)
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    success, rotation_vector, translation_vector = cv2.solvePnP(
        FACE_3D_MODEL,
        image_points,
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not success or rotation_vector is None or not np.all(np.isfinite(rotation_vector)):
        return _safe_previous_pose()

    rmat, _ = cv2.Rodrigues(rotation_vector)
    if rmat is None or not np.all(np.isfinite(rmat)):
        return _safe_previous_pose()

    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
    raw_pitch = float(np.clip(angles[0], -60.0, 60.0))
    raw_yaw = float(np.clip(angles[1], -75.0, 75.0))
    raw_roll = float(np.clip(angles[2], -45.0, 45.0))
    if not np.all(np.isfinite([raw_pitch, raw_yaw, raw_roll])):
        return _safe_previous_pose()

    if _ema_init:
        raw_yaw = float(np.clip(raw_yaw, _smooth_yaw - _MAX_POSE_JUMP_DEG, _smooth_yaw + _MAX_POSE_JUMP_DEG))
        raw_pitch = float(np.clip(raw_pitch, _smooth_pitch - _MAX_POSE_JUMP_DEG, _smooth_pitch + _MAX_POSE_JUMP_DEG))
        raw_roll = float(np.clip(raw_roll, _smooth_roll - _MAX_POSE_JUMP_DEG, _smooth_roll + _MAX_POSE_JUMP_DEG))
        _smooth_yaw = _EMA_ALPHA * raw_yaw + (1.0 - _EMA_ALPHA) * _smooth_yaw
        _smooth_pitch = _EMA_ALPHA * raw_pitch + (1.0 - _EMA_ALPHA) * _smooth_pitch
        _smooth_roll = _EMA_ALPHA * raw_roll + (1.0 - _EMA_ALPHA) * _smooth_roll
    else:
        _smooth_yaw = raw_yaw
        _smooth_pitch = raw_pitch
        _smooth_roll = raw_roll
        _ema_init = True

    return _smooth_yaw, _smooth_pitch, _smooth_roll


def get_ear(landmarks, eye_points, w, h, h_span=None):
    """Eye Aspect Ratio for one eye."""
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in eye_points]

    if h_span is None:
        sorted_x = sorted(pts, key=lambda p: p[0])
        h_span = np.linalg.norm(np.array(sorted_x[-1]) - np.array(sorted_x[0]))

    if len(eye_points) == 10:
        sorted_x = sorted(pts, key=lambda p: p[0])
        middle_8 = sorted_x[1:-1]

        v_dists = []
        for i in range(0, 8, 2):
            pair = middle_8[i:i + 2]
            v_dists.append(abs(pair[0][1] - pair[1][1]))

        return sum(v_dists) / (4.0 * h_span + 1e-6)

    v1 = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    v2 = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    return (v1 + v2) / (2.0 * h_span + 1e-6)


def get_dominant_ear(landmarks, w, h, yaw=0.0, max_left_span=None, max_right_span=None):
    from config import EAR_EXTENDED, LEFT_EYE_10, RIGHT_EYE_10

    left_pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in LEFT_EYE]
    right_pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in RIGHT_EYE]

    left_span = np.linalg.norm(np.array(left_pts[0]) - np.array(left_pts[3]))
    right_span = np.linalg.norm(np.array(right_pts[0]) - np.array(right_pts[3]))

    if EAR_EXTENDED:
        ear_left = get_ear(landmarks, LEFT_EYE_10, w, h, left_span)
        ear_right = get_ear(landmarks, RIGHT_EYE_10, w, h, right_span)
    else:
        ear_left = get_ear(landmarks, LEFT_EYE, w, h, left_span)
        ear_right = get_ear(landmarks, RIGHT_EYE, w, h, right_span)

    vis_left = 1.0
    vis_right = 1.0
    if max_left_span and max_right_span:
        vis_left = float(np.clip(left_span / (max_left_span + 1e-6), 0.0, 1.2))
        vis_right = float(np.clip(right_span / (max_right_span + 1e-6), 0.0, 1.2))

    margin = 0.1
    if vis_left > vis_right + margin:
        ear_value = 0.85 * ear_left + 0.15 * ear_right
    elif vis_right > vis_left + margin:
        ear_value = 0.85 * ear_right + 0.15 * ear_left
    else:
        ear_value = (ear_left + ear_right) / 2.0

    min_visibility = min(vis_left, vis_right)
    symmetry = min(left_span, right_span) / (max(left_span, right_span) + 1e-6)
    confidence = 0.65 * min(1.0, min_visibility) + 0.35 * symmetry
    if min_visibility < EAR_MIN_VISIBILITY:
        confidence *= max(0.25, min_visibility / (EAR_MIN_VISIBILITY + 1e-6))

    return float(ear_value), float(np.clip(confidence, 0.0, 1.0))


def get_mar(landmarks, mouth_points, w, h):
    """Mouth Aspect Ratio."""
    pts = [(landmarks[i].x * w, landmarks[i].y * h) for i in mouth_points]
    v1 = np.linalg.norm(np.array(pts[1]) - np.array(pts[5]))
    v2 = np.linalg.norm(np.array(pts[2]) - np.array(pts[4]))
    h1 = np.linalg.norm(np.array(pts[0]) - np.array(pts[3]))
    return (v1 + v2) / (2.0 * h1 + 1e-6)
