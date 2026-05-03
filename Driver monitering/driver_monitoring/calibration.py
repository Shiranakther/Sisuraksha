import collections

import numpy as np

import config as cfg


def _cfg(name, default):
    return getattr(cfg, name, default)


class Calibrator:
    """
    Compatibility calibrator that restores the original one-shot neutral-pose
    flow while preserving the attributes the current UI expects.
    """

    _CLOSED_RATIO = (0.84, 0.80)
    _BLINK_RATIO = (0.88, 0.84)
    _FATIGUE_RATIO = (0.92, 0.89)
    _YAWN_RATIO = (1.35, 1.20)

    def __init__(self):
        frame_target = self._frames_required()

        self.frames = collections.deque(maxlen=frame_target)
        self.yaw_frames = collections.deque(maxlen=frame_target)
        self.pitch_frames = collections.deque(maxlen=frame_target)
        self.mar_frames = collections.deque(maxlen=frame_target)
        self.left_span_frames = collections.deque(maxlen=frame_target)
        self.right_span_frames = collections.deque(maxlen=frame_target)
        self.gaze_h_frames = collections.deque(maxlen=frame_target)
        self.gaze_v_frames = collections.deque(maxlen=frame_target)
        self.gaze_conf_frames = collections.deque(maxlen=frame_target)
        self.ear_conf_frames = collections.deque(maxlen=frame_target)

        self.baseline_ear = None
        self.baseline_yaw = None
        self.baseline_pitch = None
        self.baseline_mar = None
        self.baseline_gaze_h = None
        self.baseline_gaze_v = None
        self.max_left_span = None
        self.max_right_span = None
        self.baseline_eye_visibility = None
        self.baseline_ear_confidence = None

        self.negative_mirror_gaze_range = None
        self.positive_mirror_gaze_range = None
        self.negative_mirror_yaw_range = None
        self.positive_mirror_yaw_range = None
        self.left_mirror_gaze_range = None
        self.right_mirror_gaze_range = None
        self.mirror_reference_yaw = None

        self.angle_factor = 0.0
        self.calibrated = False

        self.ear_fatigue_threshold = None
        self.ear_closed_threshold = None
        self.mar_yawn_threshold = None
        self.blink_threshold = None

        self.last_skip_reason = ""
        self.last_reject_reason = ""
        self.pause_required = False
        self.auto_retry_used = 0
        self.stage_phase = "collect"
        self.stage_stable_count = 0
        self.stage_bad_frames = 0

    @staticmethod
    def _lerp(head_on, extreme, factor):
        return head_on + (extreme - head_on) * factor

    @staticmethod
    def _safe_percentile(values, percentile, fallback):
        if len(values) == 0:
            return fallback
        return float(np.percentile(values, percentile))

    def _frames_required(self):
        return int(max(1, _cfg("CALIBRATION_FRAMES", 30)))

    def _clear_buffers(self):
        self.frames.clear()
        self.yaw_frames.clear()
        self.pitch_frames.clear()
        self.mar_frames.clear()
        self.left_span_frames.clear()
        self.right_span_frames.clear()
        self.gaze_h_frames.clear()
        self.gaze_v_frames.clear()
        self.gaze_conf_frames.clear()
        self.ear_conf_frames.clear()

    def _calc_angle_factor(self):
        yaw_norm = min(abs(self.baseline_yaw or 0.0) / 35.0, 1.0)
        pitch_norm = min(abs(self.baseline_pitch or 0.0) / 60.0, 1.0)
        return min(0.75 * yaw_norm + 0.25 * pitch_norm, 1.0)

    @property
    def current_stage_name(self):
        return "FORWARD"

    @property
    def current_stage_target(self):
        return self._frames_required()

    @property
    def accepted_sample_count(self):
        return len(self.frames)

    @property
    def skipped_frame_count(self):
        return 0

    @property
    def total_frames_required(self):
        return self._frames_required()

    @property
    def frames_collected(self):
        return len(self.frames)

    @property
    def instruction(self):
        if self.calibrated:
            return "Calibration complete. Monitoring resumed."
        if self.last_reject_reason:
            return "Look forward. Keep your head steady, eyes open, and mouth closed."
        return (
            "Look forward. Keep your head steady, eyes open, and mouth closed. "
            f"Collecting {len(self.frames)}/{self._frames_required()} samples."
        )

    @property
    def progress(self):
        return int((len(self.frames) / self._frames_required()) * 100)

    def acknowledge_retry(self):
        self.pause_required = False
        self.auto_retry_used = 0
        self.stage_phase = "collect"

    def export_profile(self):
        if not self.calibrated:
            return None

        return {
            "baseline_ear": self.baseline_ear,
            "baseline_yaw": self.baseline_yaw,
            "baseline_pitch": self.baseline_pitch,
            "baseline_mar": self.baseline_mar,
            "baseline_gaze_h": self.baseline_gaze_h,
            "baseline_gaze_v": self.baseline_gaze_v,
            "max_left_span": self.max_left_span,
            "max_right_span": self.max_right_span,
            "baseline_eye_visibility": self.baseline_eye_visibility,
            "baseline_ear_confidence": self.baseline_ear_confidence,
            "negative_mirror_gaze_range": self.negative_mirror_gaze_range,
            "positive_mirror_gaze_range": self.positive_mirror_gaze_range,
            "negative_mirror_yaw_range": self.negative_mirror_yaw_range,
            "positive_mirror_yaw_range": self.positive_mirror_yaw_range,
            "left_mirror_gaze_range": self.left_mirror_gaze_range,
            "right_mirror_gaze_range": self.right_mirror_gaze_range,
            "mirror_reference_yaw": self.mirror_reference_yaw,
            "angle_factor": self.angle_factor,
            "ear_fatigue_threshold": self.ear_fatigue_threshold,
            "ear_closed_threshold": self.ear_closed_threshold,
            "mar_yawn_threshold": self.mar_yawn_threshold,
            "blink_threshold": self.blink_threshold,
        }

    def load_profile(self, profile):
        required = (
            "baseline_ear",
            "baseline_yaw",
            "baseline_pitch",
            "baseline_mar",
            "ear_fatigue_threshold",
            "ear_closed_threshold",
            "mar_yawn_threshold",
            "blink_threshold",
        )
        if not isinstance(profile, dict) or any(profile.get(key) is None for key in required):
            return False

        for key, value in profile.items():
            if hasattr(self, key):
                setattr(self, key, value)

        self.calibrated = True
        self.pause_required = False
        self.auto_retry_used = 0
        self.stage_phase = "advance"
        self.last_skip_reason = ""
        self.last_reject_reason = ""
        return True

    def update(
        self,
        ear,
        yaw,
        pitch,
        mar,
        left_span=1.0,
        right_span=1.0,
        gaze_h=-1.0,
        gaze_v=-1.0,
        ear_confidence=1.0,
        gaze_confidence=0.0,
    ):
        if self.calibrated:
            return True

        self.last_skip_reason = ""
        self.stage_phase = "collect"
        self.pause_required = False
        self.auto_retry_used = 0
        self.stage_bad_frames = 0
        self.stage_stable_count = min(
            int(max(1, _cfg("CALIBRATION_PRE_STABLE_FRAMES", 5))),
            len(self.frames) + 1,
        )

        self.frames.append(float(ear))
        self.yaw_frames.append(float(yaw))
        self.pitch_frames.append(float(pitch))
        self.mar_frames.append(float(mar))
        self.left_span_frames.append(float(left_span))
        self.right_span_frames.append(float(right_span))
        self.ear_conf_frames.append(float(ear_confidence))

        if gaze_h >= 0.0 and gaze_v >= 0.0:
            self.gaze_h_frames.append(float(gaze_h))
            self.gaze_v_frames.append(float(gaze_v))
            self.gaze_conf_frames.append(float(gaze_confidence))

        if len(self.frames) < self._frames_required():
            return False

        ear_arr = np.asarray(self.frames, dtype=np.float32)
        yaw_arr = np.asarray(self.yaw_frames, dtype=np.float32)
        pitch_arr = np.asarray(self.pitch_frames, dtype=np.float32)
        mar_arr = np.asarray(self.mar_frames, dtype=np.float32)
        left_span_arr = np.asarray(self.left_span_frames, dtype=np.float32)
        right_span_arr = np.asarray(self.right_span_frames, dtype=np.float32)
        ear_conf_arr = np.asarray(self.ear_conf_frames, dtype=np.float32)
        gaze_h_arr = np.asarray(self.gaze_h_frames, dtype=np.float32)
        gaze_v_arr = np.asarray(self.gaze_v_frames, dtype=np.float32)
        gaze_conf_arr = np.asarray(self.gaze_conf_frames, dtype=np.float32)

        ear_std = float(np.std(ear_arr))
        yaw_std = float(np.std(yaw_arr))
        pitch_std = float(np.std(pitch_arr))

        ear_med = float(np.median(ear_arr))
        mar_med = float(np.median(mar_arr))
        blink_like_ratio = float(np.mean(ear_arr < (ear_med * 0.82)))
        yawn_like_ratio = float(np.mean(mar_arr > (mar_med * 1.30)))

        reject_reasons = []
        if (
            ear_std > float(_cfg("CALIBRATION_MAX_EAR_STD", 0.055))
            or yaw_std > float(_cfg("CALIBRATION_MAX_YAW_STD", 7.0))
            or pitch_std > float(_cfg("CALIBRATION_MAX_PITCH_STD", 8.5))
        ):
            reject_reasons.append(
                "unstable baseline "
                f"(yaw_std={yaw_std:.2f}, pitch_std={pitch_std:.2f}, ear_std={ear_std:.3f})"
            )
        if blink_like_ratio > float(_cfg("CALIBRATION_MAX_BLINK_RATIO", 0.16)):
            reject_reasons.append("too many blink/eye-closure samples")
        if yawn_like_ratio > float(_cfg("CALIBRATION_MAX_YAWN_RATIO", 0.10)):
            reject_reasons.append("mouth not neutral (possible talking/yawning)")

        if reject_reasons:
            self.last_reject_reason = "; ".join(reject_reasons)
            self.auto_retry_used = 1
            self.stage_stable_count = 0
            print(f"[Calibration] REJECTED: {self.last_reject_reason}")
            print("[Calibration] Please keep a neutral face: eyes open, mouth closed, head steady.")
            self._clear_buffers()
            return False

        ear_keep_floor = float(np.percentile(ear_arr, 35))
        mar_keep_ceil = float(np.percentile(mar_arr, 60))
        ear_open_samples = ear_arr[ear_arr >= ear_keep_floor]
        mar_neutral_samples = mar_arr[mar_arr <= mar_keep_ceil]

        self.baseline_ear = float(np.mean(ear_open_samples)) if len(ear_open_samples) else float(np.mean(ear_arr))
        self.baseline_yaw = float(np.median(yaw_arr))
        self.baseline_pitch = float(np.median(pitch_arr))
        self.baseline_mar = float(np.mean(mar_neutral_samples)) if len(mar_neutral_samples) else float(np.mean(mar_arr))

        self.max_left_span = self._safe_percentile(left_span_arr, 90, None)
        self.max_right_span = self._safe_percentile(right_span_arr, 90, None)
        if self.max_left_span and self.max_right_span:
            left_vis = left_span_arr / (self.max_left_span + 1e-6)
            right_vis = right_span_arr / (self.max_right_span + 1e-6)
            self.baseline_eye_visibility = float(np.median(np.minimum(left_vis, right_vis)))
        else:
            self.baseline_eye_visibility = 1.0
        self.baseline_ear_confidence = float(np.median(ear_conf_arr)) if len(ear_conf_arr) else 1.0

        if len(gaze_h_arr):
            min_gaze_conf = float(_cfg("GAZE_CONFIDENCE_MIN", 0.45))
            if len(gaze_conf_arr):
                mask = gaze_conf_arr >= min_gaze_conf
                gaze_h_sel = gaze_h_arr[mask] if np.any(mask) else gaze_h_arr
                gaze_v_sel = gaze_v_arr[mask] if np.any(mask) else gaze_v_arr
            else:
                gaze_h_sel = gaze_h_arr
                gaze_v_sel = gaze_v_arr
            self.baseline_gaze_h = float(np.median(gaze_h_sel))
            self.baseline_gaze_v = float(np.median(gaze_v_sel))
        else:
            self.baseline_gaze_h = 0.5
            self.baseline_gaze_v = 0.5

        self.angle_factor = self._calc_angle_factor()

        closed_ratio = self._lerp(*self._CLOSED_RATIO, self.angle_factor)
        blink_ratio = self._lerp(*self._BLINK_RATIO, self.angle_factor)
        fatigue_ratio = self._lerp(*self._FATIGUE_RATIO, self.angle_factor)
        yawn_ratio = self._lerp(*self._YAWN_RATIO, self.angle_factor)

        self.ear_closed_threshold = self.baseline_ear * closed_ratio
        self.blink_threshold = self.baseline_ear * blink_ratio
        self.ear_fatigue_threshold = self.baseline_ear * fatigue_ratio
        self.mar_yawn_threshold = self.baseline_mar * yawn_ratio

        if self.ear_closed_threshold >= self.blink_threshold:
            self.ear_closed_threshold = self.blink_threshold - 0.01

        self.last_reject_reason = ""
        self.stage_phase = "advance"
        self.calibrated = True

        angle_label = "HEAD-ON" if self.angle_factor < 0.3 else (
            "MODERATE" if self.angle_factor < 0.6 else "EXTREME"
        )
        print(
            f"[Calibration] Camera Angle: {angle_label} "
            f"(factor={self.angle_factor:.2f}, "
            f"yaw={self.baseline_yaw:.1f}, pitch={self.baseline_pitch:.1f})"
        )
        print(f"[Calibration] Baseline EAR={self.baseline_ear:.3f}  MAR={self.baseline_mar:.3f}")
        print(
            f"[Calibration] Blink < {self.blink_threshold:.3f}  "
            f"Closed < {self.ear_closed_threshold:.3f}  "
            f"Yawn > {self.mar_yawn_threshold:.3f}"
        )

        return True
