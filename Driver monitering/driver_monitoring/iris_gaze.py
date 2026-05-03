import time

import numpy as np

from config import (
    DISTRACTION_YAW_THRESHOLD,
    EYES_ONLY_MIRROR_HOLD_SECONDS,
    EYES_ONLY_MIRROR_MAX_YAW,
    EYES_ONLY_MIRROR_MIN_GAZE_DELTA,
    GAZE_CONFIDENCE_MIN,
    GAZE_EYES_OFF_ROAD_DELTA,
    GAZE_PHONE_DOWN_DELTA,
    GAZE_PUPIL_CONFIDENCE_STRONG,
    IRIS_ENABLED,
    LEFT_EYE_BOTTOM,
    LEFT_EYE_LEFT_CORNER,
    LEFT_EYE_RIGHT_CORNER,
    LEFT_EYE_TOP,
    LEFT_IRIS_CENTER,
    LEFT_IRIS_RING,
    MIRROR_GRACE_SECONDS,
    MIRROR_MAX_SECONDS,
    MIRROR_MIN_SECONDS,
    MIRROR_YAW_THRESHOLD,
    RIGHT_EYE_BOTTOM,
    RIGHT_EYE_LEFT_CORNER,
    RIGHT_EYE_RIGHT_CORNER,
    RIGHT_EYE_TOP,
    RIGHT_IRIS_CENTER,
    RIGHT_IRIS_RING,
    YAW_THRESHOLD,
)


def _point_xy(landmarks, idx, w, h):
    return np.array([landmarks[idx].x * w, landmarks[idx].y * h], dtype=np.float64)


def _eye_gaze_metrics(landmarks, iris_ring, center_idx, left_idx, right_idx, top_idx, bottom_idx, w, h):
    iris_pts = np.array([_point_xy(landmarks, idx, w, h) for idx in iris_ring], dtype=np.float64)
    center_pt = _point_xy(landmarks, center_idx, w, h)
    iris_center = (iris_pts.mean(axis=0) + center_pt) / 2.0

    left_corner = _point_xy(landmarks, left_idx, w, h)
    right_corner = _point_xy(landmarks, right_idx, w, h)
    top_pt = _point_xy(landmarks, top_idx, w, h)
    bottom_pt = _point_xy(landmarks, bottom_idx, w, h)

    width = float(np.linalg.norm(right_corner - left_corner))
    height = float(np.linalg.norm(bottom_pt - top_pt))
    if width < 1.0 or height < 1.0:
        return {"gaze_h": -1.0, "gaze_v": -1.0, "confidence": 0.0}

    gaze_h = float((iris_center[0] - left_corner[0]) / (width + 1e-6))
    gaze_v = float((iris_center[1] - top_pt[1]) / (height + 1e-6))

    radii = np.linalg.norm(iris_pts - iris_center, axis=1)
    mean_radius = float(np.mean(radii))
    radius_std = float(np.std(radii))
    ring_consistency = max(0.0, 1.0 - radius_std / (mean_radius + 1e-6))
    openness = float(np.clip(height / (width * 0.30 + 1e-6), 0.0, 1.0))
    in_bounds = 1.0 if (-0.15 <= gaze_h <= 1.15 and -0.15 <= gaze_v <= 1.15) else 0.35
    confidence = float(np.clip(0.55 * ring_consistency + 0.45 * openness, 0.0, 1.0) * in_bounds)

    return {"gaze_h": gaze_h, "gaze_v": gaze_v, "confidence": confidence}


def get_gaze(landmarks, w, h):
    if not IRIS_ENABLED:
        return -1.0, -1.0, {
            "gaze_confidence": 0.0,
            "left_pupil_confidence": 0.0,
            "right_pupil_confidence": 0.0,
            "dominant_eye": "none",
        }

    left = _eye_gaze_metrics(
        landmarks, LEFT_IRIS_RING, LEFT_IRIS_CENTER,
        LEFT_EYE_LEFT_CORNER, LEFT_EYE_RIGHT_CORNER, LEFT_EYE_TOP, LEFT_EYE_BOTTOM, w, h,
    )
    right = _eye_gaze_metrics(
        landmarks, RIGHT_IRIS_RING, RIGHT_IRIS_CENTER,
        RIGHT_EYE_LEFT_CORNER, RIGHT_EYE_RIGHT_CORNER, RIGHT_EYE_TOP, RIGHT_EYE_BOTTOM, w, h,
    )

    left_conf = left["confidence"]
    right_conf = right["confidence"]
    total_conf = left_conf + right_conf
    if total_conf <= 1e-6:
        return -1.0, -1.0, {
            "gaze_confidence": 0.0,
            "left_pupil_confidence": left_conf,
            "right_pupil_confidence": right_conf,
            "dominant_eye": "none",
        }

    dominant_eye = "both"
    if max(left_conf, right_conf) >= GAZE_PUPIL_CONFIDENCE_STRONG and abs(left_conf - right_conf) >= 0.18:
        if left_conf > right_conf:
            gaze_h = left["gaze_h"]
            gaze_v = left["gaze_v"]
            dominant_eye = "left"
        else:
            gaze_h = right["gaze_h"]
            gaze_v = right["gaze_v"]
            dominant_eye = "right"
        gaze_confidence = max(left_conf, right_conf)
    else:
        gaze_h = (left["gaze_h"] * left_conf + right["gaze_h"] * right_conf) / (total_conf + 1e-6)
        gaze_v = (left["gaze_v"] * left_conf + right["gaze_v"] * right_conf) / (total_conf + 1e-6)
        gaze_confidence = min(1.0, total_conf / 2.0)

    return float(gaze_h), float(gaze_v), {
        "gaze_confidence": float(gaze_confidence),
        "left_pupil_confidence": float(left_conf),
        "right_pupil_confidence": float(right_conf),
        "dominant_eye": dominant_eye,
    }


class GazeAttentionTracker:
    """Calibrated gaze interpretation with mirror-check timing and fallback certainty."""

    def __init__(self):
        self._mirror_start = None
        self._mirror_last_seen = None
        self._eyes_only_start = None
        self._last_meta = self._blank_meta()

    @staticmethod
    def _blank_meta():
        return {
            "mirror_elapsed": 0.0,
            "gaze_dx": 0.0,
            "gaze_dy": 0.0,
            "mirror_candidate": False,
            "mirror_protected": False,
            "mirror_overdue": False,
            "eyes_only_mirror": False,
            "yaw_only_mirror": False,
            "gaze_confidence": 0.0,
            "dominant_eye": "none",
            "attention_confidence": 0.0,
        }

    def reset(self):
        self._mirror_start = None
        self._mirror_last_seen = None
        self._eyes_only_start = None
        self._last_meta = self._blank_meta()

    def evaluate(self, yaw, pitch, gaze_h, gaze_v, calibrator=None, gaze_meta=None, current_time=None):
        if current_time is None:
            current_time = time.time()

        if not IRIS_ENABLED or gaze_h < 0.0 or gaze_v < 0.0:
            self.reset()
            return "UNKNOWN", dict(self._last_meta)

        gaze_meta = gaze_meta or {}
        gaze_conf = float(gaze_meta.get("gaze_confidence", 0.0))
        dominant_eye = gaze_meta.get("dominant_eye", "none")

        base_h = (getattr(calibrator, "baseline_gaze_h", 0.5) if calibrator else 0.5) or 0.5
        base_v = (getattr(calibrator, "baseline_gaze_v", 0.5) if calibrator else 0.5) or 0.5
        neg_range = getattr(calibrator, "negative_mirror_gaze_range", None) if calibrator else None
        pos_range = getattr(calibrator, "positive_mirror_gaze_range", None) if calibrator else None
        neg_yaw_range = getattr(calibrator, "negative_mirror_yaw_range", None) if calibrator else None
        pos_yaw_range = getattr(calibrator, "positive_mirror_yaw_range", None) if calibrator else None

        gaze_dx = float(gaze_h - base_h)
        gaze_dy = float(gaze_v - base_v)

        mirror_candidate = False
        yaw_only_candidate = False
        full_match = False

        if yaw < 0.0:
            if neg_yaw_range is not None:
                yaw_only_candidate = neg_yaw_range[0] <= yaw <= neg_yaw_range[1]
            else:
                yaw_only_candidate = MIRROR_YAW_THRESHOLD <= abs(yaw) < DISTRACTION_YAW_THRESHOLD
            if yaw_only_candidate and neg_range is not None and gaze_conf >= GAZE_CONFIDENCE_MIN:
                full_match = neg_range[0] <= gaze_h <= neg_range[1]
                mirror_candidate = full_match
        elif yaw > 0.0:
            if pos_yaw_range is not None:
                yaw_only_candidate = pos_yaw_range[0] <= yaw <= pos_yaw_range[1]
            else:
                yaw_only_candidate = MIRROR_YAW_THRESHOLD <= yaw < DISTRACTION_YAW_THRESHOLD
            if yaw_only_candidate and pos_range is not None and gaze_conf >= GAZE_CONFIDENCE_MIN:
                full_match = pos_range[0] <= gaze_h <= pos_range[1]
                mirror_candidate = full_match

        if not mirror_candidate and yaw_only_candidate and gaze_conf < GAZE_CONFIDENCE_MIN:
            mirror_candidate = True
        elif not mirror_candidate and yaw_only_candidate:
            mirror_candidate = gaze_dx * (1.0 if yaw > 0 else -1.0) >= 0.08
            full_match = mirror_candidate

        if mirror_candidate:
            if self._mirror_start is None:
                self._mirror_start = current_time
            self._mirror_last_seen = current_time
        elif (
            self._mirror_last_seen is not None
            and abs(yaw) >= MIRROR_YAW_THRESHOLD
            and abs(yaw) < DISTRACTION_YAW_THRESHOLD
            and (current_time - self._mirror_last_seen) <= MIRROR_GRACE_SECONDS
        ):
            mirror_candidate = True
        else:
            self._mirror_start = None
            self._mirror_last_seen = None

        mirror_elapsed = (current_time - self._mirror_start) if self._mirror_start is not None else 0.0
        mirror_protected = mirror_candidate and abs(yaw) >= MIRROR_YAW_THRESHOLD and abs(yaw) < DISTRACTION_YAW_THRESHOLD
        mirror_overdue = mirror_elapsed > (MIRROR_MAX_SECONDS + MIRROR_GRACE_SECONDS)

        eyes_only_candidate = (
            not mirror_protected
            and gaze_conf >= GAZE_CONFIDENCE_MIN
            and abs(yaw) <= EYES_ONLY_MIRROR_MAX_YAW
            and abs(gaze_dx) >= EYES_ONLY_MIRROR_MIN_GAZE_DELTA
            and abs(gaze_dy) < GAZE_PHONE_DOWN_DELTA
        )
        if eyes_only_candidate:
            if self._eyes_only_start is None:
                self._eyes_only_start = current_time
        else:
            self._eyes_only_start = None
        eyes_only_elapsed = (current_time - self._eyes_only_start) if self._eyes_only_start is not None else 0.0
        eyes_only_mirror = eyes_only_candidate and eyes_only_elapsed >= EYES_ONLY_MIRROR_HOLD_SECONDS

        if abs(yaw) >= DISTRACTION_YAW_THRESHOLD:
            mirror_protected = False
            mirror_candidate = False
            yaw_only_candidate = False
            self._mirror_last_seen = None
            self._mirror_start = None
            mirror_elapsed = 0.0
            mirror_overdue = False
            eyes_only_mirror = False
            self._eyes_only_start = None

        eyes_down = gaze_conf >= GAZE_CONFIDENCE_MIN and gaze_dy >= GAZE_PHONE_DOWN_DELTA and abs(yaw) < YAW_THRESHOLD
        eyes_off_road = gaze_conf >= GAZE_CONFIDENCE_MIN and abs(gaze_dx) >= GAZE_EYES_OFF_ROAD_DELTA

        if eyes_down and pitch > 4.0 and not mirror_protected:
            state = "PHONE IN LAP"
        elif mirror_protected and mirror_elapsed >= max(0.05, MIRROR_MIN_SECONDS * 0.2) and not mirror_overdue:
            state = "MIRROR CHECK"
        elif eyes_only_mirror:
            state = "MIRROR CHECK"
        elif abs(yaw) >= DISTRACTION_YAW_THRESHOLD or eyes_off_road:
            state = "EYES OFF ROAD"
        else:
            state = "ALERT"

        attention_confidence = 0.80 if full_match else (0.60 if yaw_only_candidate else 0.30)
        self._last_meta = {
            "mirror_elapsed": round(mirror_elapsed, 3),
            "gaze_dx": round(gaze_dx, 3),
            "gaze_dy": round(gaze_dy, 3),
            "mirror_candidate": mirror_candidate,
            "mirror_protected": mirror_protected,
            "mirror_overdue": mirror_overdue,
            "eyes_only_mirror": eyes_only_mirror,
            "yaw_only_mirror": yaw_only_candidate and not full_match,
            "gaze_confidence": round(gaze_conf, 3),
            "dominant_eye": dominant_eye,
            "attention_confidence": attention_confidence,
        }
        return state, dict(self._last_meta)


def get_attention_state(
    yaw,
    pitch,
    gaze_h,
    gaze_v,
    calibrator=None,
    tracker=None,
    gaze_meta=None,
    current_time=None,
):
    if tracker is None:
        tracker = GazeAttentionTracker()
    return tracker.evaluate(
        yaw,
        pitch,
        gaze_h,
        gaze_v,
        calibrator=calibrator,
        gaze_meta=gaze_meta,
        current_time=current_time,
    )
