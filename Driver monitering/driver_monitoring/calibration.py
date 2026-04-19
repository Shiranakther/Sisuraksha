# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Auto-Calibration Module (Angle-Adaptive)
# Collects baseline metrics over first N frames and automatically
# adjusts all detection thresholds based on camera mounting angle.
# Handles: glasses, eye shape, camera distance, camera angle.
# ══════════════════════════════════════════════════════════════

import collections
import numpy as np
from config import CALIBRATION_FRAMES


class Calibrator:
    """
    Angle-adaptive calibrator.
    
    During the calibration window, it records EAR, MAR, Yaw, and Pitch.
    After calibration, it calculates the camera's angular deviation from
    head-on and interpolates ALL detection thresholds between tight
    (head-on) and generous (extreme angle) values automatically.
    """

    # ── Ratio ranges: (head_on_value, extreme_angle_value) ──
    # Head-on = camera directly in front, extreme = camera at ~25+ degree offset
    _CLOSED_RATIO   = (0.84, 0.80)   # EAR × this = "eyes closed"
    _BLINK_RATIO    = (0.88, 0.84)   # EAR × this = "blink detected"
    _FATIGUE_RATIO  = (0.92, 0.89)   # EAR × this = "fatigued EAR"
    _YAWN_RATIO     = (1.35, 1.20)   # MAR × this = "yawning"  (lowered: 1.50× was too strict)

    def __init__(self):
        self.frames       = collections.deque(maxlen=CALIBRATION_FRAMES)
        self.yaw_frames   = collections.deque(maxlen=CALIBRATION_FRAMES)
        self.pitch_frames = collections.deque(maxlen=CALIBRATION_FRAMES)
        self.mar_frames   = collections.deque(maxlen=CALIBRATION_FRAMES)

        self.baseline_ear   = None
        self.baseline_yaw   = None
        self.baseline_pitch = None
        self.baseline_mar   = None
        self.angle_factor   = 0.0    # 0.0 = head-on, 1.0 = extreme angle
        self.calibrated     = False

        # Derived thresholds (set after calibration)
        self.ear_fatigue_threshold = None
        self.ear_closed_threshold  = None
        self.mar_yawn_threshold    = None
        self.blink_threshold       = None
        self.last_reject_reason    = ""

    @staticmethod
    def _lerp(head_on, extreme, factor):
        """Linear interpolation between head-on and extreme-angle values."""
        return head_on + (extreme - head_on) * factor

    def _calc_angle_factor(self):
        """
        Calculate how angled the camera is from 0.0 (head-on) to 1.0 (extreme).
        Uses the magnitude of baseline yaw+pitch offset.
        Clamps at 1.0 for extreme combined offsets.
        Yaw/Pitch are normalised ±1, so 0.3 = moderate, 0.6+ = extreme.
        """
        yaw_norm = min(abs(self.baseline_yaw) / 0.55, 1.0)
        pitch_norm = min(abs(self.baseline_pitch) / 1.35, 1.0)
        # Yaw distorts eye geometry much more than pitch for this landmark setup.
        return min(0.75 * yaw_norm + 0.25 * pitch_norm, 1.0)

    def update(self, ear, yaw, pitch, mar):
        """
        Feed one EAR, Yaw, Pitch, and MAR reading.
        Returns True once calibration is complete.
        """
        if self.calibrated:
            return True

        self.frames.append(ear)
        self.yaw_frames.append(yaw)
        self.pitch_frames.append(pitch)
        self.mar_frames.append(mar)

        if len(self.frames) == CALIBRATION_FRAMES:
            # ── Validation Gate ────────────────────────
            # Reject calibration if there's too much movement or blinking
            ear_arr = np.asarray(self.frames, dtype=np.float32)
            yaw_arr = np.asarray(self.yaw_frames, dtype=np.float32)
            pitch_arr = np.asarray(self.pitch_frames, dtype=np.float32)
            mar_arr = np.asarray(self.mar_frames, dtype=np.float32)

            ear_std = float(np.std(ear_arr))
            yaw_std = float(np.std(yaw_arr))

            ear_med = float(np.median(ear_arr))
            mar_med = float(np.median(mar_arr))
            blink_like_ratio = float(np.mean(ear_arr < (ear_med * 0.82)))
            yawn_like_ratio = float(np.mean(mar_arr > (mar_med * 1.30)))

            reject_reasons = []
            if ear_std > 0.04 or yaw_std > 0.10:
                reject_reasons.append(f"unstable baseline (yaw_std={yaw_std:.3f}, ear_std={ear_std:.3f})")
            if blink_like_ratio > 0.16:
                reject_reasons.append("too many blink/eye-closure samples")
            if yawn_like_ratio > 0.10:
                reject_reasons.append("mouth not neutral (possible talking/yawning)")

            if reject_reasons:
                self.last_reject_reason = "; ".join(reject_reasons)
                print(f"[Calibration] REJECTED: {self.last_reject_reason}")
                print("[Calibration] Please keep a neutral face: eyes open, mouth closed, head steady.")
                # Clear buffers to force a fresh attempt
                self.frames.clear()
                self.yaw_frames.clear()
                self.pitch_frames.clear()
                self.mar_frames.clear()
                return False

            # Build robust neutral baseline from mostly-open-eye and mostly-closed-mouth samples.
            ear_keep_floor = float(np.percentile(ear_arr, 35))
            mar_keep_ceil = float(np.percentile(mar_arr, 60))
            ear_open_samples = ear_arr[ear_arr >= ear_keep_floor]
            mar_neutral_samples = mar_arr[mar_arr <= mar_keep_ceil]

            self.baseline_ear = float(np.mean(ear_open_samples)) if len(ear_open_samples) else float(np.mean(ear_arr))
            self.baseline_yaw = float(np.median(yaw_arr))
            self.baseline_pitch = float(np.median(pitch_arr))
            self.baseline_mar = float(np.mean(mar_neutral_samples)) if len(mar_neutral_samples) else float(np.mean(mar_arr))

            # Calculate camera angle severity
            self.angle_factor = self._calc_angle_factor()

            # Interpolate all ratios based on detected angle
            closed_ratio  = self._lerp(*self._CLOSED_RATIO,  self.angle_factor)
            blink_ratio   = self._lerp(*self._BLINK_RATIO,   self.angle_factor)
            fatigue_ratio = self._lerp(*self._FATIGUE_RATIO,  self.angle_factor)
            yawn_ratio    = self._lerp(*self._YAWN_RATIO,     self.angle_factor)

            # Compute final thresholds
            self.ear_closed_threshold  = self.baseline_ear * closed_ratio
            self.blink_threshold       = self.baseline_ear * blink_ratio
            self.ear_fatigue_threshold = self.baseline_ear * fatigue_ratio
            self.mar_yawn_threshold    = self.baseline_mar * yawn_ratio

            # Keep threshold ordering sane: fatigue > blink > closed.
            if self.ear_closed_threshold >= self.blink_threshold:
                self.ear_closed_threshold = self.blink_threshold - 0.01

            self.last_reject_reason = ""

            self.calibrated = True

            # ── Diagnostic output ──
            angle_label = "HEAD-ON" if self.angle_factor < 0.3 else (
                          "MODERATE" if self.angle_factor < 0.6 else "EXTREME")
            print(f"[Calibration] Camera Angle: {angle_label} "
                  f"(factor={self.angle_factor:.2f}, "
                  f"yaw={self.baseline_yaw:.1f}, pitch={self.baseline_pitch:.1f})")
            print(f"[Calibration] Baseline EAR={self.baseline_ear:.3f}  MAR={self.baseline_mar:.3f}")
            print(f"[Calibration] Blink < {self.blink_threshold:.3f}  "
                  f"Closed < {self.ear_closed_threshold:.3f}  "
                  f"Yawn > {self.mar_yawn_threshold:.3f}")

        return self.calibrated

    @property
    def progress(self):
        """Return calibration progress as 0-100 %."""
        return int((len(self.frames) / CALIBRATION_FRAMES) * 100)
