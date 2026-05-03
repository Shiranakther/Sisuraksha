import collections
import time

import numpy as np

from config import (
    EAR_CONFIDENCE_MIN_FOR_DROWSINESS,
    EAR_STRONG_CLOSED_RATIO,
    FATIGUE_ENTRY_SECONDS,
    HEAD_NOD_HOLD_SEC,
    HEAD_NOD_MIN_DROP,
    HEAD_NOD_PITCH_LEVEL,
    HEAD_NOD_WINDOW_SEC,
    MICROSLEEP_ENTRY_SECONDS,
    MICROSLEEP_EXIT_OPEN_FRAMES,
    MIN_BLINKS_TO_JUDGE,
    MIRROR_YAW_THRESHOLD,
    PERCLOS_WINDOW_SEC,
    SLOW_BLINK_MS,
)


class DrowsinessDetector:
    """Tracks PERCLOS, blink durations, and microsleep events."""

    def __init__(self):
        self.ear_history = collections.deque()
        self._median_buffer = collections.deque(maxlen=3)
        self.blink_start = None
        self.blink_durations = collections.deque(maxlen=10)
        self.microsleep_start = None
        self.low_ear_start = None
        self.pitch_history = collections.deque(maxlen=90)
        self.head_nod_start = None
        self.last_head_nod_drop = 0.0
        self.last_head_nod_elapsed = 0.0
        self._ear_ema = None
        self._ear_alpha = 0.45
        self._microsleep_open_frames = 0

    def filter_ear(self, ear):
        """Return a smoothed EAR value to reduce frame-to-frame jitter."""
        self._median_buffer.append(float(ear))
        median_ear = float(np.median(self._median_buffer))
        if self._ear_ema is None:
            self._ear_ema = median_ear
        else:
            self._ear_ema = self._ear_alpha * median_ear + (1 - self._ear_alpha) * self._ear_ema
        return self._ear_ema

    def update_ear_history(self, ear, weight=1.0):
        """Append the current EAR plus a quality weight into the rolling window."""
        now = time.time()
        self.ear_history.append((now, float(ear), float(max(0.0, min(1.0, weight)))))
        while self.ear_history and (now - self.ear_history[0][0]) > PERCLOS_WINDOW_SEC:
            self.ear_history.popleft()

    def get_perclos(self, closed_threshold):
        if not closed_threshold or len(self.ear_history) < 10:
            return 0.0
        total_weight = sum(weight for _, _, weight in self.ear_history)
        if total_weight <= 1e-6:
            return 0.0
        closed_weight = sum(weight for _, ear, weight in self.ear_history if ear < closed_threshold)
        return (closed_weight / total_weight) * 100.0

    def process_blink(self, ear, current_time=None, blink_threshold=0.21):
        if current_time is None:
            current_time = time.time()
        if ear < blink_threshold:
            if self.blink_start is None:
                self.blink_start = current_time
        elif self.blink_start is not None:
            duration_ms = (current_time - self.blink_start) * 1000.0
            self.blink_durations.append(duration_ms)
            self.blink_start = None

    def is_slow_blinking(self):
        if len(self.blink_durations) < MIN_BLINKS_TO_JUDGE:
            return False
        recent = list(self.blink_durations)[-5:]
        return float(np.mean(recent)) > SLOW_BLINK_MS

    def get_avg_blink_ms(self):
        if len(self.blink_durations) == 0:
            return 0.0
        return float(np.mean(list(self.blink_durations)))

    def check_low_ear_fatigue(self, ear_norm, quality_level="MEDIUM", hold_seconds=FATIGUE_ENTRY_SECONDS):
        """
        Return True when normalized EAR stays below the fatigue region long enough.
        Low-quality frames do not build fatigue evidence.
        """
        now = time.time()
        if quality_level == "INSUFFICIENT":
            self.low_ear_start = None
            return False, 0.0

        if ear_norm < 0.92:
            if self.low_ear_start is None:
                self.low_ear_start = now
            elapsed = now - self.low_ear_start
            return elapsed >= hold_seconds, elapsed

        self.low_ear_start = None
        return False, 0.0

    def check_gradual_head_nod(self, pitch):
        now = time.time()
        pitch = float(pitch)
        self.pitch_history.append((now, pitch))

        while self.pitch_history and (now - self.pitch_history[0][0]) > HEAD_NOD_WINDOW_SEC:
            self.pitch_history.popleft()

        if len(self.pitch_history) < 4:
            self.head_nod_start = None
            self.last_head_nod_drop = 0.0
            self.last_head_nod_elapsed = 0.0
            return False, 0.0, 0.0

        samples = list(self.pitch_history)
        first_count = max(1, len(samples) // 4)
        start_pitch = float(np.mean([p for _, p in samples[:first_count]]))
        peak_pitch = float(max(p for _, p in samples))
        pitch_drop = peak_pitch - start_pitch
        self.last_head_nod_drop = pitch_drop

        nod_candidate = (
            pitch_drop >= HEAD_NOD_MIN_DROP
            and pitch >= HEAD_NOD_PITCH_LEVEL
            and (peak_pitch - pitch) <= 2.0
        )
        if nod_candidate:
            if self.head_nod_start is None:
                self.head_nod_start = now
            elapsed = now - self.head_nod_start
            self.last_head_nod_elapsed = elapsed
            return elapsed >= HEAD_NOD_HOLD_SEC, elapsed, pitch_drop

        if pitch <= (HEAD_NOD_PITCH_LEVEL - 2.0):
            self.head_nod_start = None
        self.last_head_nod_elapsed = 0.0
        return False, 0.0, pitch_drop

    def microsleep_gate(self, ear_norm, quality_level, support_present, mirror_protected, side_turn, ear_confidence):
        if quality_level == "INSUFFICIENT":
            return False, "insufficient measurement quality"
        if mirror_protected and ear_confidence < 0.70 and not support_present:
            return False, "mirror-protected side view with weak eye evidence"
        if side_turn and ear_confidence < 0.50 and not support_present:
            return False, "side-view eye evidence too weak"
        if ear_norm < 0.80 and support_present:
            return True, "strong closure with support"
        return False, "not enough evidence"

    def check_microsleep(
        self,
        ear,
        ear_norm,
        closed_threshold,
        yaw=0.0,
        ear_confidence=1.0,
        support_present=False,
        strong_closed_threshold=None,
        mirror_protected=False,
        quality_level="MEDIUM",
    ):
        now = time.time()
        reopen_threshold = closed_threshold + 0.015
        if strong_closed_threshold is None:
            strong_closed_threshold = closed_threshold * EAR_STRONG_CLOSED_RATIO

        side_turn = abs(yaw) >= MIRROR_YAW_THRESHOLD
        allowed, reason = self.microsleep_gate(
            ear_norm=ear_norm,
            quality_level=quality_level,
            support_present=support_present,
            mirror_protected=mirror_protected,
            side_turn=side_turn,
            ear_confidence=ear_confidence,
        )
        if not allowed and ear >= strong_closed_threshold:
            self._microsleep_open_frames = 0
            self.microsleep_start = None
            return False, 0.0, reason

        if ear < reopen_threshold and ear_norm < 0.86:
            self._microsleep_open_frames = 0
            if self.microsleep_start is None:
                self.microsleep_start = now
            elapsed = now - self.microsleep_start
            return elapsed >= MICROSLEEP_ENTRY_SECONDS, elapsed, reason

        if self.microsleep_start is None:
            return False, 0.0, reason

        self._microsleep_open_frames += 1
        if self._microsleep_open_frames >= MICROSLEEP_EXIT_OPEN_FRAMES:
            self.microsleep_start = None
            self._microsleep_open_frames = 0
            return False, 0.0, reason

        elapsed = now - self.microsleep_start
        return elapsed >= MICROSLEEP_ENTRY_SECONDS, elapsed, reason

    def reset(self):
        self.ear_history.clear()
        self._median_buffer.clear()
        self.blink_start = None
        self.blink_durations.clear()
        self.microsleep_start = None
        self.low_ear_start = None
        self.pitch_history.clear()
        self.head_nod_start = None
        self.last_head_nod_drop = 0.0
        self.last_head_nod_elapsed = 0.0
        self._ear_ema = None
        self._microsleep_open_frames = 0
