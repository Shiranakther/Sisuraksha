from dataclasses import dataclass

from config import (
    QUALITY_EAR_CONF_MIN,
    QUALITY_GAZE_CONF_MIN,
    QUALITY_VISIBILITY_MIN,
)


@dataclass
class MeasurementQuality:
    face_visible: bool
    ear_confidence: float
    gaze_confidence: float
    eye_visibility: float
    pose_stable: bool
    overall: float
    level: str
    reason: str


def classify_quality_level(score: float) -> str:
    if score >= 0.75:
        return "HIGH"
    if score >= 0.55:
        return "MEDIUM"
    if score >= 0.35:
        return "LOW"
    return "INSUFFICIENT"


def build_measurement_quality(
    face_visible,
    ear_confidence,
    gaze_confidence,
    left_span,
    right_span,
    calibrator,
    yaw_rate,
    pitch_rate,
):
    if not face_visible:
        return MeasurementQuality(False, 0.0, 0.0, 0.0, False, 0.0, "INSUFFICIENT", "no face")

    max_left = max(1e-6, float(getattr(calibrator, "max_left_span", left_span) or left_span or 1.0))
    max_right = max(1e-6, float(getattr(calibrator, "max_right_span", right_span) or right_span or 1.0))
    vis_left = min(1.0, float(left_span) / max_left)
    vis_right = min(1.0, float(right_span) / max_right)
    eye_visibility = min(vis_left, vis_right)
    pose_stable = abs(float(yaw_rate)) <= 25.0 and abs(float(pitch_rate)) <= 20.0

    score = (
        0.35 * max(0.0, min(1.0, float(ear_confidence)))
        + 0.25 * max(0.0, min(1.0, float(gaze_confidence)))
        + 0.25 * max(0.0, min(1.0, float(eye_visibility)))
        + 0.15 * (1.0 if pose_stable else 0.35)
    )

    if eye_visibility < QUALITY_VISIBILITY_MIN * 0.65:
        reason = "eye visibility too low"
    elif ear_confidence < QUALITY_EAR_CONF_MIN * 0.8:
        reason = "ear confidence too low"
    elif gaze_confidence < QUALITY_GAZE_CONF_MIN * 0.6:
        reason = "gaze confidence weak"
    elif not pose_stable:
        reason = "pose unstable"
    else:
        reason = "ok"

    return MeasurementQuality(
        face_visible=True,
        ear_confidence=float(ear_confidence),
        gaze_confidence=float(gaze_confidence),
        eye_visibility=float(eye_visibility),
        pose_stable=pose_stable,
        overall=float(score),
        level=classify_quality_level(score),
        reason=reason,
    )


def expected_open_ear(calibrator, yaw, eye_visibility):
    from config import EAR_SIDE_COMPENSATION_MAX, EAR_YAW_REF_DEG

    baseline = float(getattr(calibrator, "baseline_ear", 0.25) or 0.25)
    yaw_mag = min(abs(float(yaw)) / max(EAR_YAW_REF_DEG, 1e-6), 1.0)
    vis_penalty = max(0.0, 1.0 - float(eye_visibility))
    side_comp = 1.0 - (EAR_SIDE_COMPENSATION_MAX * yaw_mag + 0.08 * vis_penalty)
    side_comp = max(0.72, min(1.0, side_comp))
    return baseline * side_comp


def normalize_ear(calibrator, ear, yaw, eye_visibility):
    exp_open = max(1e-6, expected_open_ear(calibrator, yaw, eye_visibility))
    return float(ear) / exp_open
