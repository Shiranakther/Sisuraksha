# ══════════════════════════════════════════════════════════════
# SISURAKSHA — State Machine Module
# State priority logic and temporal smoothing
# ══════════════════════════════════════════════════════════════

import collections
from config import (
    SMOOTH_BUFFER_SIZE, STAGE_DISPLAY,
    MAR_SUSTAIN_FRAMES,
    YAW_THRESHOLD, PITCH_DOWN_THRESHOLD,
    PERCLOS_FATIGUED, PERCLOS_DROWSY
)


class StateMachine:
    """
    Determines the driver's overall state each frame using a
    priority-based system and applies temporal smoothing.
    """

    # Priority order (higher = more critical)
    STATES = {
        "NO FACE":       0,
        "ALERT":         1,
        "MIRROR CHECK":  2,
        "YAWNING":       3,
        "LOOKING DOWN":  4,
        "EYES OFF ROAD": 5,
        "PHONE IN LAP":  6,
        "PHONE USE":     7,     # YOLOv8n detected phone
        "DISTRACTED":    8,
        "FATIGUED":      9,
        "DROWSY":       10,
        "MICROSLEEP":   11,
    }

    def __init__(self):
        self.state_buffer    = collections.deque(maxlen=SMOOTH_BUFFER_SIZE)
        self.mar_high_frames = 0   # consecutive frames with MAR above threshold
        self.yawn_hold       = 0   # hold yawning state for N frames after MAR drops

    def determine_state(self, face_visible, ear, mar, yaw, pitch,
                        perclos, is_microsleep, is_slow_blink,
                        attention="UNKNOWN", calibrated=True,
                        phone_detected=False, mar_threshold=0.50):
        """
        Evaluate all metrics and return the highest-priority state.
        Returns (state_label, stage_int, bgr_color).
        """
        if not face_visible:
            return "NO FACE", 0, (128, 128, 128)

        if not calibrated:
            return "CALIBRATING", 0, (255, 255, 0)

        # ── Track yawn sustain ────────────────────────
        if mar > mar_threshold:
            self.mar_high_frames += 1
            self.yawn_hold = 15  # hold yawn state for 15 frames after last high MAR
        else:
            if self.yawn_hold > 0:
                self.yawn_hold -= 1
            else:
                self.mar_high_frames = 0

        # ── Build candidate list with priorities ──────
        candidates = ["ALERT"]  # default

        # Yawning — require sustained MAR
        if self.mar_high_frames >= MAR_SUSTAIN_FRAMES:
            candidates.append("YAWNING")

        # Head pose
        if abs(yaw) >= YAW_THRESHOLD:
            # Check if it's a mirror check (iris says eyes on road)
            if attention == "MIRROR CHECK":
                candidates.append("MIRROR CHECK")
            else:
                candidates.append("DISTRACTED")

        if pitch > PITCH_DOWN_THRESHOLD:
            candidates.append("LOOKING DOWN")

        # Phone detection (YOLOv8n)
        if phone_detected:
            candidates.append("PHONE USE")

        # Iris-based states (future — only when attention != UNKNOWN)
        if attention == "EYES OFF ROAD":
            candidates.append("EYES OFF ROAD")
        if attention == "PHONE IN LAP":
            candidates.append("PHONE IN LAP")

        # Drowsiness progression
        if is_slow_blink or perclos > PERCLOS_FATIGUED:
            candidates.append("FATIGUED")
        if perclos > PERCLOS_DROWSY:
            candidates.append("DROWSY")
        if is_microsleep:
            candidates.append("MICROSLEEP")

        # Pick highest priority
        best = max(candidates, key=lambda s: self.STATES.get(s, 0))

        # Map to drowsiness stage
        stage = self._state_to_stage(best)
        color = STAGE_DISPLAY.get(stage, (255, 255, 255))[1]

        return best, stage, color

    def get_smoothed_state(self, state):
        """Temporal smoothing — return most frequent recent state."""
        self.state_buffer.append(state)
        return max(set(self.state_buffer), key=self.state_buffer.count)

    # ── Internal helpers ──────────────────────────────
    _STAGE_MAP = {
        "ALERT":         0,
        "CALIBRATING":   0,
        "MIRROR CHECK":  0,
        "FATIGUED":      1,
        "DROWSY":        2,
        "MICROSLEEP":    3,
        "YAWNING":       4,
        "DISTRACTED":    5,
        "LOOKING DOWN":  6,
        "PHONE USE":     7,
        "PHONE IN LAP":  7,
        "EYES OFF ROAD": 8,
        "NO FACE":       9,
    }

    @staticmethod
    def _state_to_stage(state):
        """Map state label to stage ID (matches STAGE_DISPLAY in config)."""
        return StateMachine._STAGE_MAP.get(state, 0)
