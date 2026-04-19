# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Drowsiness Detection Module
# PERCLOS, slow blink detection, microsleep timer
# ══════════════════════════════════════════════════════════════

import time
import collections
import numpy as np
from config import (
    PERCLOS_WINDOW,
    SLOW_BLINK_MS, MIN_BLINKS_TO_JUDGE,
    MICROSLEEP_SECONDS,
    HEAD_NOD_WINDOW_SEC,
    HEAD_NOD_MIN_DROP,
    HEAD_NOD_PITCH_LEVEL,
    HEAD_NOD_HOLD_SEC,
)


class DrowsinessDetector:
    """Tracks PERCLOS, blink durations, and microsleep events."""

    def __init__(self):
        self.ear_history     = collections.deque(maxlen=PERCLOS_WINDOW)
        self.blink_start     = None
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
        if self._ear_ema is None:
            self._ear_ema = float(ear)
        else:
            self._ear_ema = self._ear_alpha * float(ear) + (1 - self._ear_alpha) * self._ear_ema
        return self._ear_ema

    # ── PERCLOS ───────────────────────────────────────
    def update_ear_history(self, ear):
        """Append current EAR to the rolling window."""
        self.ear_history.append(ear)

    def get_perclos(self, closed_threshold):
        """
        PERCLOS = % of recent frames where EAR < closed_threshold.
        Returns 0.0 if threshold not set or insufficient history.
        """
        if not closed_threshold or len(self.ear_history) < 10:
            return 0.0
        closed_frames = sum(1 for e in self.ear_history if e < closed_threshold)
        return (closed_frames / len(self.ear_history)) * 100.0

    # ── Slow Blink Detection ─────────────────────────
    def process_blink(self, ear, current_time=None, blink_threshold=0.21):
        """Track blink start/end and record duration in ms."""
        if current_time is None:
            current_time = time.time()

        if ear < blink_threshold:
            if self.blink_start is None:
                self.blink_start = current_time
        else:
            if self.blink_start is not None:
                duration_ms = (current_time - self.blink_start) * 1000.0
                self.blink_durations.append(duration_ms)
                self.blink_start = None

    def is_slow_blinking(self):
        """True if average of recent blinks exceeds SLOW_BLINK_MS."""
        if len(self.blink_durations) < MIN_BLINKS_TO_JUDGE:
            return False
        recent = list(self.blink_durations)[-5:]
        return float(np.mean(recent)) > SLOW_BLINK_MS

    def get_avg_blink_ms(self):
        """Return average blink duration in ms (0.0 if no data)."""
        if len(self.blink_durations) == 0:
            return 0.0
        return float(np.mean(list(self.blink_durations)))

    def check_low_ear_fatigue(self, ear, fatigue_threshold, hold_seconds=0.8):
        """Return True when EAR stays below fatigue threshold for a short duration."""
        now = time.time()
        if ear < fatigue_threshold:
            if self.low_ear_start is None:
                self.low_ear_start = now
            elapsed = now - self.low_ear_start
            return elapsed >= hold_seconds, elapsed

        self.low_ear_start = None
        return False, 0.0

    def check_gradual_head_nod(self, pitch):
        """
        Detect gradual downward head drift over a short time window.
        Returns (is_nod: bool, nod_elapsed_seconds: float, pitch_drop: float).
        """
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
            and (peak_pitch - pitch) <= 0.06
        )

        if nod_candidate:
            if self.head_nod_start is None:
                self.head_nod_start = now
            elapsed = now - self.head_nod_start
            self.last_head_nod_elapsed = elapsed
            return elapsed >= HEAD_NOD_HOLD_SEC, elapsed, pitch_drop

        if pitch <= (HEAD_NOD_PITCH_LEVEL - 0.06):
            self.head_nod_start = None
        self.last_head_nod_elapsed = 0.0
        return False, 0.0, pitch_drop

    # ── Microsleep Timer ──────────────────────────────
    def check_microsleep(self, ear, closed_threshold):
        """
        Returns (is_microsleep: bool, elapsed_seconds: float).
        Uses wall-clock time, not frame count, for Pi reliability.
        """
        now = time.time()
        reopen_threshold = closed_threshold + 0.015

        if ear < reopen_threshold:
            self._microsleep_open_frames = 0
            if self.microsleep_start is None:
                self.microsleep_start = now
            elapsed = now - self.microsleep_start
            return elapsed >= MICROSLEEP_SECONDS, elapsed
        else:
            if self.microsleep_start is None:
                return False, 0.0

            # Require a few consecutive open frames before resetting, to avoid
            # missing microsleep events due to noisy EAR spikes.
            self._microsleep_open_frames += 1
            if self._microsleep_open_frames >= 3:
                self.microsleep_start = None
                self._microsleep_open_frames = 0
                return False, 0.0

            elapsed = now - self.microsleep_start
            return elapsed >= MICROSLEEP_SECONDS, elapsed

    def reset(self):
        """Reset runtime history and timers (used on recalibration)."""
        self.ear_history.clear()
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
