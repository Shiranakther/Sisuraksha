from config import (
    DISTRACTED_CONFIRM_SECONDS,
    LOOKING_DOWN_CONFIRM_SECONDS,
    PERCLOS_DROWSY,
    PERCLOS_FATIGUED,
    PITCH_DOWN_THRESHOLD,
    STAGE_DISPLAY,
    YAWNING_CONFIRM_SECONDS,
)


class StateMachine:
    """
    Determines the driver's overall state each frame using a
    priority-based system and applies temporal smoothing.
    """

    PRIORITY = (
        "NO FACE",
        "PHONE USE",
        "MICROSLEEP",
        "DROWSY",
        "FATIGUED",
        "YAWNING",
        "DISTRACTED",
        "EYES OFF ROAD",
        "LOOKING DOWN",
        "PHONE IN LAP",
        "MIRROR CHECK",
        "ALERT",
    )

    STATE_WINDOWS = {
        "MICROSLEEP": 2,
        "PHONE USE": 3,
        "DISTRACTED": 4,
        "DROWSY": 6,
        "FATIGUED": 8,
        "YAWNING": 3,
        "LOOKING DOWN": 4,
        "PHONE IN LAP": 3,
        "ALERT": 2,
        "MIRROR CHECK": 2,
        "EYES OFF ROAD": 3,
    }

    def __init__(self):
        self.candidate_state = "ALERT"
        self.candidate_count = 0
        self.current_smoothed_state = "ALERT"

    def determine_state(
        self,
        face_visible,
        ear,
        mar,
        yaw,
        pitch,
        perclos,
        is_microsleep,
        is_slow_blink,
        attention="UNKNOWN",
        calibrated=True,
        phone_detected=False,
        mar_threshold=0.50,
        context=None,
    ):
        context = context or {}

        if not face_visible:
            return "NO FACE", 0, (128, 128, 128), "no face visible"
        if not calibrated:
            return "CALIBRATING", 0, (255, 255, 0), "waiting for calibration"

        quality_level = context.get("quality_level", "MEDIUM")
        distracted_ready = context.get("distracted_elapsed", 0.0) >= DISTRACTED_CONFIRM_SECONDS
        looking_down_ready = context.get("looking_down_elapsed", 0.0) >= LOOKING_DOWN_CONFIRM_SECONDS
        yawning_ready = context.get("high_mar_elapsed", 0.0) >= YAWNING_CONFIRM_SECONDS
        mirror_elapsed = context.get("mirror_elapsed", 0.0)
        mirror_soft_protected = context.get("mirror_soft_protected", False)
        mirror_active = mirror_soft_protected or context.get("eyes_only_mirror", False) or (
            attention == "MIRROR CHECK" and context.get("mirror_candidate", False)
        )

        candidates = {}
        reasons = {"ALERT": "default"}

        if phone_detected and (context.get("phone_in_driver_zone", True) or not mirror_soft_protected):
            candidates["PHONE USE"] = True
            reasons["PHONE USE"] = "phone detector"

        if is_microsleep and not context.get("phone_like_downlook", False):
            candidates["MICROSLEEP"] = True
            reasons["MICROSLEEP"] = context.get("microsleep_reason", "sustained strong eye closure")

        if perclos > PERCLOS_DROWSY and quality_level != "INSUFFICIENT" and not mirror_soft_protected:
            candidates["DROWSY"] = True
            reasons["DROWSY"] = "high perclos"

        if (
            (is_slow_blink or perclos > PERCLOS_FATIGUED)
            and quality_level in ("LOW", "MEDIUM", "HIGH")
            and not mirror_soft_protected
        ):
            candidates["FATIGUED"] = True
            reasons["FATIGUED"] = "fatigue cues present"

        if yawning_ready and mar > mar_threshold and quality_level != "INSUFFICIENT" and not mirror_soft_protected:
            candidates["YAWNING"] = True
            reasons["YAWNING"] = f"high MAR for {context.get('high_mar_elapsed', 0.0):.2f}s"

        if attention == "EYES OFF ROAD" and distracted_ready and not mirror_active:
            candidates["EYES OFF ROAD"] = True
            reasons["EYES OFF ROAD"] = f"eyes off road for {context.get('distracted_elapsed', 0.0):.2f}s"

        if context.get("offroad_by_yaw", False) and distracted_ready and not mirror_active:
            candidates["DISTRACTED"] = True
            reasons["DISTRACTED"] = f"off-road head turn for {context.get('distracted_elapsed', 0.0):.2f}s"

        if attention == "PHONE IN LAP" and not mirror_soft_protected:
            candidates["PHONE IN LAP"] = True
            reasons["PHONE IN LAP"] = "gaze down with forward head"

        if (
            ((pitch > PITCH_DOWN_THRESHOLD and looking_down_ready) or context.get("phone_like_downlook", False))
            and not mirror_soft_protected
        ):
            candidates["LOOKING DOWN"] = True
            reasons["LOOKING DOWN"] = f"downward attention for {context.get('looking_down_elapsed', 0.0):.2f}s"

        if mirror_active and mirror_elapsed > 0.0 and not context.get("mirror_overdue", False):
            candidates["MIRROR CHECK"] = True
            reasons["MIRROR CHECK"] = f"mirror check {mirror_elapsed:.2f}s"

        chosen = "ALERT"
        reason = reasons["ALERT"]
        for state in self.PRIORITY:
            if state == "ALERT":
                break
            if candidates.get(state):
                chosen = state
                reason = reasons.get(state, "candidate active")
                break

        stage = self._state_to_stage(chosen)
        color = STAGE_DISPLAY.get(stage, ("", (255, 255, 255)))[1]
        return chosen, stage, color, reason

    def get_smoothed_state(self, state):
        if state == self.candidate_state:
            self.candidate_count += 1
        else:
            self.candidate_state = state
            self.candidate_count = 1

        required_frames = self.STATE_WINDOWS.get(state, 2)
        if self.candidate_count >= required_frames:
            self.current_smoothed_state = state
        return self.current_smoothed_state

    _STAGE_MAP = {
        "ALERT": 0,
        "CALIBRATING": 0,
        "MIRROR CHECK": 0,
        "FATIGUED": 1,
        "DROWSY": 2,
        "MICROSLEEP": 3,
        "YAWNING": 4,
        "DISTRACTED": 5,
        "LOOKING DOWN": 6,
        "PHONE USE": 7,
        "PHONE IN LAP": 7,
        "EYES OFF ROAD": 8,
        "NO FACE": 9,
    }

    @staticmethod
    def _state_to_stage(state):
        return StateMachine._STAGE_MAP.get(state, 0)
