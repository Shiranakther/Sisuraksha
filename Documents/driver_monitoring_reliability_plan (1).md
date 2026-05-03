# SISURAKSHA Driver Monitoring Reliability Redesign Plan (Detailed Engineering Spec)

## Implemented Calibration Flow

The calibration runtime now follows these rules:
- every session starts fresh; no saved calibration is auto-loaded at startup
- the tool uses three required stages: `FORWARD`, `LEFT MIRROR`, `RIGHT MIRROR`
- each stage moves through explicit phases: `settle`, `collect`, `validate`, `advance`, `paused`
- only clean frames are stored; blinks, mouth motion, weak visibility, and short jitter are skipped before storage
- timeouts start only after the first accepted sample of a stage
- bad frames soften progress instead of resetting the whole stage
- automatic retry only clears the failed stage
- after the retry budget is exhausted, the stage pauses with a clear reason and waits for a manual stage retry
- the app and Python overlay now show stage name, phase, accepted/skipped counts, skip reason, and reject reason

## Purpose

This document is a **much more detailed redesign specification** for the current driver-monitoring stack.
It covers:
- what is wrong in the current implementation,
- what must change in calibration,
- what must change in runtime identification,
- why a real system should behave that way,
- concrete code-level changes,
- reference code blocks you can adapt into the project.

This is based on a review of these modules:
- `calibration.py`
- `main.py`
- `face_metrics.py`
- `drowsiness.py`
- `iris_gaze.py`
- `config.py`

> Important scope note:
> - `state_machine.py` was not provided in the uploaded files, so state-priority recommendations are based on how `main.py` uses it.
> - The code blocks below are designed to be **implementation-grade reference code**. They are close to drop-in, but you should still integrate and test them in your environment.

---

## Executive Answer

## Does calibration need to change?
Yes. **Substantially.**

The current calibration flow is the main source of unreliable retries. It still behaves like a “collect first, reject later” pipeline. That is the opposite of what a reliable calibration system should do.

### Why the current calibration feels unreliable
Because it currently:
- warms up,
- appends every frame after warmup,
- only evaluates the batch at the end,
- then rejects the whole stage if enough noise was included.

That means the user can do the correct thing and still fail because:
- they blinked once,
- one or two yaw samples were noisy,
- the mouth opened briefly,
- iris confidence dipped for a short moment,
- pose smoothing still contained old history from before recalibration.

## Does the runtime identification logic also need to change?
Yes. **Not a full rewrite, but a structural redesign.**

The individual measurement pieces are usable. The main problem is how those pieces are connected and interpreted.

The runtime stack should move toward:

`raw measurements -> measurement quality -> normalized signals -> event candidates -> confirmed states -> alert policy`

instead of:

`threshold checks -> immediate labels`

## What is the main real-system principle?
A real system should treat **low confidence as uncertainty**, not as strong negative evidence.

Examples:
- weak iris visibility should not automatically become distraction,
- weak side-view EAR should not automatically become drowsiness,
- noisy head pose should not ruin calibration,
- quick mirror checks should be protected as normal driving behavior.

---

## Part 1 — What Is Wrong in the Current Code

## 1.1 Problems in `calibration.py`

The current `Calibrator` is already better than a simple EAR-only baseline because it stores:
- EAR,
- yaw,
- pitch,
- MAR,
- left/right eye span,
- gaze H/V,
- confidence values,
- mirror yaw/gaze ranges.

That is good.

But the control flow is still brittle.

### Main structural problems

#### Problem A — It stores all frames after warmup
After `stage_warmup_remaining` reaches zero, `update()` immediately calls `_append_current(...)` for every frame. There is no **per-frame quality gate** before storage.

That means bad samples are allowed into the stage buffer.

#### Problem B — Forward stage still assumes neutral should be near zero yaw
`_validate_forward_stage()` still checks:
- absolute median yaw against `CALIBRATION_NEUTRAL_YAW_MAX`,
- yaw std,
- pitch std,
- blink-like ratio,
- yawn-like ratio.

The stability checks are reasonable, but the hard “center enough” expectation is too strict for many real camera positions.

#### Problem C — Side-stage validation is not directional enough during collection
`_validate_side_stage()` checks mostly:
- turn magnitude,
- steadiness,
- mouth neutrality,
- median gaze confidence.

But it does **not strongly enforce the intended direction during collection**. That means the user can partially do the wrong side and only discover later that the two sides do not separate properly.

#### Problem D — Finalization can clear both side stages together
`_finalize_side_ranges()` sorts the two side stages by yaw median and can clear both if they are not distinct enough. This makes the system feel random from the user’s point of view.

#### Problem E — Only final rejection is exposed clearly
The calibrator has `last_reject_reason`, but it does not have a strong live “skip reason” model for why current frames are being ignored.

### Consequence
The user experiences calibration as:
- fragile,
- repetitive,
- unclear,
- unfair.

That is why your “I am looking forward but it retries a lot” complaint is valid.

---

## 1.2 Problems in `main.py`

### Problem A — Duplicate `draw_calibration()` definitions
`main.py` defines `draw_calibration()` twice. The second one overrides the first. That is confusing, makes maintenance harder, and increases the chance of UI logic drifting.

### Problem B — Manual retry flow is incomplete
`manual_retry_required` exists, but in the uploaded code path it is not actually driven by a complete stage-failure policy. So the code has the shape of a pause-and-retry design, but the behavior is not fully wired.

### Problem C — Recalibration does not reset head-pose smoothing
`reset_calibration()` recreates:
- `Calibrator()`
- `DrowsinessDetector()`
- `StateMachine()`
- `GazeAttentionTracker()`

but it does not reset the module-level head-pose EMA stored in `face_metrics.py`.

This means the new calibration can inherit pose bias from the old session.

### Problem D — Calibration reporting is stage-progress oriented, not frame-quality oriented
The UI reports progress and rejection, but the user still lacks strong live feedback such as:
- hold still,
- eyes not clear,
- close mouth,
- move closer,
- turn more left,
- turn more right.

### Problem E — No persistent calibration profile
Calibration is thrown away between runs. That makes repeated real-world use more fragile and more annoying.

---

## 1.3 Problems in `face_metrics.py`

### Problem A — Pose smoothing is global and sticky
`_smooth_yaw`, `_smooth_pitch`, `_smooth_roll`, and `_ema_init` are module-level variables.

That is fine for runtime smoothing, but it becomes a problem when recalibration happens and those values are not reset.

### Problem B — `solvePnP` success is not guarded strongly enough
The code assumes the returned pose is usable. A safer implementation should:
- check success,
- check finite values,
- clip impossible one-frame jumps,
- use fallback output when the solve is unreliable.

### Problem C — Comment / implementation mismatch
The comments describe a geometry-based head-pose idea, but the current implementation uses `cv2.solvePnP`.
That mismatch should be cleaned up.

---

## 1.4 Problems in `drowsiness.py`

The drowsiness module already has useful ideas:
- EAR smoothing,
- blink duration tracking,
- PERCLOS,
- low-EAR hold,
- head nod,
- microsleep timing.

But the logic still needs a stronger confidence model.

### Problems
- PERCLOS is based on EAR history, but not strongly weighted by measurement quality.
- Side-view EAR can still bias fatigue evidence.
- Microsleep suppression is partly reactive rather than based on a unified quality layer.
- Expected open-eye EAR is not modeled explicitly as a function of view.

---

## 1.5 Problems in `iris_gaze.py`

The gaze tracker is already one of the stronger pieces in the system.
It includes:
- iris-based gaze,
- confidence,
- mirror candidate timing,
- mirror grace,
- eyes-only mirror support,
- eyes-off-road / phone-like logic.

But it still needs changes.

### Problems
- Mirror recognition still depends too much on gaze quality at the moment where gaze quality is often weakest.
- There is no explicit “yaw-only calibrated mirror fallback mode” as a first-class behavior.
- Attention output should expose certainty more clearly.

---

## 1.6 Problems in `config.py`

The existing config already contains many good knobs.
However, several new ones are needed for a more reliable architecture:
- stage stability requirement,
- per-stage timeout,
- max auto retries,
- live frame quality floors,
- camera-bias-tolerant forward logic,
- view-aware EAR normalization,
- clearer state hysteresis.

---

## Part 2 — How a Real System Should Behave

This section gives the **logical argument** for why the redesign is necessary.

## 2.1 Core Behavioral Rules

### Rule 1 — Uncertain measurement is not dangerous behavior
If the system is unsure whether the eye is visible, the correct output is usually:
- `UNKNOWN`,
- `hold last stable interpretation`, or
- `insufficient evidence`

not:
- `DROWSY`,
- `DISTRACTED`,
- `MICROSLEEP`.

### Rule 2 — Calibration should collect only clean frames
A reliable calibration system should reject or skip bad frames **before** storing them.
Bad frames should not poison the stage buffer.

### Rule 3 — “Forward” means the driver’s natural forward pose in that camera setup
A real camera is not always centered. The baseline should learn the actual driver-camera geometry, not a lab-perfect geometry.

### Rule 4 — Mirror checks are normal and should be protected
Mirror checks are legitimate driving behavior. A real system should:
- recognize them,
- protect them from distraction alerts,
- only escalate when the duration or angle moves beyond normal mirror behavior.

### Rule 5 — Severe alerts require stronger evidence
A high-severity state like `MICROSLEEP` should require stronger evidence than a mild state like `FATIGUED`.

### Rule 6 — Real-time systems need hysteresis
Signals fluctuate frame to frame. Entry and exit should use:
- hold time,
- grace periods,
- separate thresholds,
- confidence requirements.

---

## 2.2 Q&A — Why the System Should Act This Way

### Q1. Why should calibration skip bad frames instead of retrying the whole stage?
Because a real user can be perfectly cooperative while the sensor is briefly noisy. One blink or one noisy yaw estimate should cost one frame, not the whole stage.

### Q2. Why should forward calibration allow non-zero neutral yaw?
Because real camera setups are often off-center. A baseline should represent the driver’s true normal pose, not an artificial “zero yaw” assumption.

### Q3. Why should low-confidence eye data not immediately create drowsiness alerts?
Because uncertainty is not the same as closure. If the system cannot reliably see the eye, it should lower certainty, not increase alarm severity.

### Q4. Why should mirror checks use a yaw-only fallback?
Because side glances are exactly where iris tracking gets weaker. The system must still work in that common real-world case.

### Q5. Why should microsleep require more evidence than fatigue?
Because false microsleep alarms destroy trust very quickly. High-severity states must be harder to trigger.

### Q6. Why should the system distinguish looking down from phone use?
Because not every downward glance is equally risky. The state labels should reflect different danger levels.

### Q7. Why should calibration be persisted?
Because if the same driver uses the same camera repeatedly, recalibrating every launch adds friction and repeated noise.

### Q8. Why is threshold tuning alone not enough?
Because thresholds do not fix flawed control flow. If bad frames are stored and uncertainty is treated like evidence, changing numbers only moves the problem around.

---

## Part 3 — Target Architecture

The architecture should move toward this model:

```text
camera frame
   -> raw face / eye / mouth / iris measurements
   -> measurement quality assessment
   -> normalized signals (EAR, MAR, yaw, gaze relative to baseline)
   -> event candidates (blink, fatigue, mirror candidate, off-road candidate, phone-down candidate)
   -> temporal confirmation
   -> state arbitration
   -> UI / logging / server alert
```

## 3.1 New Shared Concepts

### 1. Measurement quality
Every frame should have a shared quality object.

### 2. Candidate vs confirmed event
Do not immediately convert a threshold crossing into a driver state.
First create a candidate, then confirm it with time and context.

### 3. Protected normal behavior
Mirror checks should be modeled as valid behavior, not just as “not distracted.”

### 4. View-aware normalization
Expected EAR and acceptable gaze interpretation should change with head pose / visibility.

---

## Part 4 — Concrete Changes by Module

## 4.1 `face_metrics.py` — Required Changes and Reference Code

### What must change
1. Add `reset_head_pose_smoothing()`.
2. Make `get_head_pose()` safer.
3. Guard against invalid `solvePnP` output.
4. Clip impossible jumps before EMA.
5. Return the last good pose when current pose solve is unreliable.

### Reference code

```python
# face_metrics.py
import numpy as np
import cv2
from config import LEFT_EYE, RIGHT_EYE, EAR_MIN_VISIBILITY

_EMA_ALPHA = 0.40
_MAX_POSE_JUMP_DEG = 18.0
_smooth_yaw = 0.0
_smooth_pitch = 0.0
_smooth_roll = 0.0
_ema_init = False

FACE_3D_MODEL = np.array([
    [0.0,    0.0,    0.0],
    [0.0,   -63.6, -12.5],
    [-43.3,  32.7, -26.0],
    [43.3,   32.7, -26.0],
    [-28.9, -28.9, -24.1],
    [28.9,  -28.9, -24.1],
], dtype=np.float64)


def reset_head_pose_smoothing():
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
    global _smooth_yaw, _smooth_pitch, _smooth_roll, _ema_init

    image_points = np.array([
        [landmarks[1].x * w,   landmarks[1].y * h],
        [landmarks[152].x * w, landmarks[152].y * h],
        [landmarks[33].x * w,  landmarks[33].y * h],
        [landmarks[263].x * w, landmarks[263].y * h],
        [landmarks[61].x * w,  landmarks[61].y * h],
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

    if not success:
        return _safe_previous_pose()

    if rotation_vector is None or not np.all(np.isfinite(rotation_vector)):
        return _safe_previous_pose()

    rmat, _ = cv2.Rodrigues(rotation_vector)
    if rmat is None or not np.all(np.isfinite(rmat)):
        return _safe_previous_pose()

    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
    raw_pitch = float(angles[0])
    raw_yaw = float(angles[1])
    raw_roll = float(angles[2])

    if not np.isfinite(raw_pitch) or not np.isfinite(raw_yaw) or not np.isfinite(raw_roll):
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
```

### Why this change matters
If pose smoothing is not reset, recalibration may start from stale yaw/pitch. That alone can make forward calibration look “unstable” even when the user is holding still.

---

## 4.2 `config.py` — New and Revised Settings

You do **not** want to solve the system by only loosening old thresholds.
You need new behavioral controls.

### Recommended additions

```python
# Calibration reliability controls
CALIBRATION_PRE_STABLE_FRAMES = 12
CALIBRATION_STAGE_TIMEOUT_SEC = 8.0
CALIBRATION_MAX_AUTO_RETRIES = 1
CALIBRATION_MIN_EYE_SPAN_PX = 18.0
CALIBRATION_GOOD_EAR_CONF_MIN = 0.65
CALIBRATION_GOOD_GAZE_CONF_MIN = 0.45
CALIBRATION_MAX_YAW_RATE = 18.0
CALIBRATION_MAX_PITCH_RATE = 15.0
CALIBRATION_SKIP_BLINK_RATIO = 0.82
CALIBRATION_SKIP_YAWN_RATIO = 1.25
CALIBRATION_FORWARD_HARD_MAX_ABS_YAW = 18.0
CALIBRATION_FORWARD_MAX_BAD_FRAMES = 40
CALIBRATION_SIDE_MAX_BAD_FRAMES = 35

# Sign convention for mirror calibration
# Verify once on your camera and keep fixed afterwards.
LEFT_MIRROR_EXPECTED_SIGN = -1
RIGHT_MIRROR_EXPECTED_SIGN = 1
CALIBRATION_DIRECTION_MARGIN_DEG = 3.0

# Runtime quality controls
QUALITY_FACE_SIZE_MIN = 0.0     # optional if you later compute normalized face size
QUALITY_EAR_CONF_STRONG = 0.70
QUALITY_EAR_CONF_MIN = 0.45
QUALITY_GAZE_CONF_STRONG = 0.60
QUALITY_GAZE_CONF_MIN = 0.45
QUALITY_VISIBILITY_MIN = 0.55

# View-aware EAR normalization
EAR_SIDE_COMPENSATION_MAX = 0.14
EAR_YAW_REF_DEG = 35.0

# Additional hysteresis
MICROSLEEP_ENTRY_SECONDS = 1.0
MICROSLEEP_EXIT_OPEN_FRAMES = 3
FATIGUE_ENTRY_SECONDS = 0.8
DISTRACTION_EXIT_GRACE_SECONDS = 0.25
LOOKING_DOWN_EXIT_GRACE_SECONDS = 0.20
```

### Why these settings are needed
The current config mostly contains threshold endpoints. The redesign needs **behavioral settings**, especially:
- stability requirement,
- timeouts,
- quality floors,
- retry policy,
- sign mapping,
- normalization controls.

---

## 4.3 `calibration.py` — Full Redesign Strategy

This is the most important module to change.

## New calibration model
Each stage should use these phases:
- `WAIT_STABLE`
- `COLLECT`
- `EVALUATE`
- `PAUSED` (when manual retry is required)

## Design goals
1. Skip bad frames instead of storing them.
2. Require stable frames before collection starts.
3. Show live skip reason.
4. Allow one automatic retry per stage.
5. Pause after repeated failure.
6. Treat forward as the driver’s natural baseline, not exact zero.
7. Validate mirror direction during collection.
8. Support yaw-only fallback when gaze is weak.

## Reference implementation skeleton

```python
# calibration.py
import collections
import json
import time
import numpy as np

from config import (
    CALIBRATION_FORWARD_FRAMES,
    CALIBRATION_SIDE_FRAMES,
    CALIBRATION_MAX_EAR_STD,
    CALIBRATION_MAX_YAW_STD,
    CALIBRATION_MAX_PITCH_STD,
    CALIBRATION_MAX_BLINK_RATIO,
    CALIBRATION_MAX_YAWN_RATIO,
    CALIBRATION_NEUTRAL_YAW_MAX,
    CALIBRATION_PRE_STABLE_FRAMES,
    CALIBRATION_STAGE_TIMEOUT_SEC,
    CALIBRATION_MAX_AUTO_RETRIES,
    CALIBRATION_MIN_EYE_SPAN_PX,
    CALIBRATION_GOOD_EAR_CONF_MIN,
    CALIBRATION_GOOD_GAZE_CONF_MIN,
    CALIBRATION_MAX_YAW_RATE,
    CALIBRATION_MAX_PITCH_RATE,
    CALIBRATION_SKIP_BLINK_RATIO,
    CALIBRATION_SKIP_YAWN_RATIO,
    CALIBRATION_FORWARD_HARD_MAX_ABS_YAW,
    CALIBRATION_FORWARD_MAX_BAD_FRAMES,
    CALIBRATION_SIDE_MAX_BAD_FRAMES,
    LEFT_MIRROR_EXPECTED_SIGN,
    RIGHT_MIRROR_EXPECTED_SIGN,
    CALIBRATION_DIRECTION_MARGIN_DEG,
    GAZE_MIRROR_DELTA_MIN,
    GAZE_CONFIDENCE_MIN,
    MIRROR_CALIBRATION_MIN_YAW,
    MIRROR_YAW_THRESHOLD,
    DISTRACTION_YAW_THRESHOLD,
)


class Calibrator:
    """
    Reliability-oriented multi-stage calibrator.

    Major differences from the old design:
    - does not store every frame,
    - requires a stable pre-roll,
    - tracks skip reason separately from reject reason,
    - supports stage retry counts,
    - supports yaw-only mirror fallback when gaze is weak.
    """

    _CLOSED_RATIO = (0.84, 0.80)
    _BLINK_RATIO = (0.88, 0.84)
    _FATIGUE_RATIO = (0.92, 0.89)
    _YAWN_RATIO = (1.35, 1.20)

    STAGES = (
        ("FORWARD", CALIBRATION_FORWARD_FRAMES, "Look forward. Keep head steady, eyes open, mouth closed."),
        ("LEFT_MIRROR", CALIBRATION_SIDE_FRAMES, "Look at the left mirror and hold that pose."),
        ("RIGHT_MIRROR", CALIBRATION_SIDE_FRAMES, "Look at the right mirror and hold that pose."),
    )

    def __init__(self):
        self.stage_index = 0
        self.stage_phase = "WAIT_STABLE"
        self.stage_started_at = time.time()
        self.stable_count = 0
        self.good_frame_count = 0
        self.bad_frame_count = 0
        self.stage_fail_counts = {name: 0 for name, _, _ in self.STAGES}
        self.stage_modes = {name: "full" for name, _, _ in self.STAGES}
        self.pause_required = False

        self.stage_samples = {
            name: self._make_stage_buffers(frame_target)
            for name, frame_target, _ in self.STAGES
        }

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
        self.last_info_message = ""

        self._prev_yaw = None
        self._prev_pitch = None
        self._prev_time = None
        self.profile_version = 2

    @staticmethod
    def _make_stage_buffers(maxlen):
        return {
            "ear": collections.deque(maxlen=maxlen),
            "yaw": collections.deque(maxlen=maxlen),
            "pitch": collections.deque(maxlen=maxlen),
            "mar": collections.deque(maxlen=maxlen),
            "left_span": collections.deque(maxlen=maxlen),
            "right_span": collections.deque(maxlen=maxlen),
            "gaze_h": collections.deque(maxlen=maxlen),
            "gaze_v": collections.deque(maxlen=maxlen),
            "gaze_conf": collections.deque(maxlen=maxlen),
            "ear_conf": collections.deque(maxlen=maxlen),
        }

    @property
    def current_stage_name(self):
        return self.STAGES[self.stage_index][0]

    @property
    def instruction(self):
        return self.STAGES[self.stage_index][2]

    @property
    def total_frames_required(self):
        return sum(stage_frames for _, stage_frames, _ in self.STAGES)

    @property
    def frames_collected(self):
        return sum(len(self.stage_samples[name]["ear"]) for name, _, _ in self.STAGES)

    @property
    def progress(self):
        return int((self.frames_collected / max(1, self.total_frames_required)) * 100)

    @staticmethod
    def _lerp(head_on, extreme, factor):
        return head_on + (extreme - head_on) * factor

    def _calc_angle_factor(self):
        yaw_norm = min(abs(self.baseline_yaw or 0.0) / 35.0, 1.0)
        pitch_norm = min(abs(self.baseline_pitch or 0.0) / 60.0, 1.0)
        return min(0.75 * yaw_norm + 0.25 * pitch_norm, 1.0)

    def _clear_stage(self, stage_name):
        for buf in self.stage_samples[stage_name].values():
            buf.clear()

    def _start_stage(self, stage_name=None):
        if stage_name is not None:
            for idx, (name, _, _) in enumerate(self.STAGES):
                if name == stage_name:
                    self.stage_index = idx
                    break
        self.stage_phase = "WAIT_STABLE"
        self.stage_started_at = time.time()
        self.stable_count = 0
        self.good_frame_count = 0
        self.bad_frame_count = 0
        self.last_skip_reason = ""
        self.last_reject_reason = ""
        self.last_info_message = ""
        self._prev_yaw = None
        self._prev_pitch = None
        self._prev_time = None
        self._clear_stage(self.current_stage_name)

    def _append_current(
        self,
        ear,
        yaw,
        pitch,
        mar,
        left_span,
        right_span,
        gaze_h,
        gaze_v,
        gaze_confidence,
        ear_confidence,
    ):
        buffers = self.stage_samples[self.current_stage_name]
        buffers["ear"].append(float(ear))
        buffers["yaw"].append(float(yaw))
        buffers["pitch"].append(float(pitch))
        buffers["mar"].append(float(mar))
        buffers["left_span"].append(float(left_span))
        buffers["right_span"].append(float(right_span))
        buffers["ear_conf"].append(float(ear_confidence))
        if gaze_h >= 0.0 and gaze_v >= 0.0:
            buffers["gaze_h"].append(float(gaze_h))
            buffers["gaze_v"].append(float(gaze_v))
            buffers["gaze_conf"].append(float(gaze_confidence))

    def _update_pose_rate(self, yaw, pitch):
        now = time.time()
        yaw_rate = 0.0
        pitch_rate = 0.0
        if self._prev_time is not None:
            dt = max(1e-3, now - self._prev_time)
            if self._prev_yaw is not None:
                yaw_rate = abs((yaw - self._prev_yaw) / dt)
            if self._prev_pitch is not None:
                pitch_rate = abs((pitch - self._prev_pitch) / dt)
        self._prev_time = now
        self._prev_yaw = float(yaw)
        self._prev_pitch = float(pitch)
        return yaw_rate, pitch_rate, now

    def _running_median_or_value(self, stage_name, key, value):
        buf = self.stage_samples[stage_name][key]
        if len(buf) < 5:
            return float(value)
        return float(np.median(np.asarray(buf, dtype=np.float32)))

    def _frame_quality_forward(
        self,
        ear,
        yaw,
        pitch,
        mar,
        left_span,
        right_span,
        ear_confidence,
        gaze_confidence,
        yaw_rate,
        pitch_rate,
    ):
        min_span = min(left_span, right_span)
        if min_span < CALIBRATION_MIN_EYE_SPAN_PX:
            return False, "move closer to the camera"
        if ear_confidence < CALIBRATION_GOOD_EAR_CONF_MIN:
            return False, "eyes not clear enough"
        if yaw_rate > CALIBRATION_MAX_YAW_RATE or pitch_rate > CALIBRATION_MAX_PITCH_RATE:
            return False, "hold still"
        if abs(yaw) > CALIBRATION_FORWARD_HARD_MAX_ABS_YAW:
            return False, "face turned too far from forward"

        ref_ear = self._running_median_or_value("FORWARD", "ear", ear)
        ref_mar = self._running_median_or_value("FORWARD", "mar", mar)
        if ear < (ref_ear * CALIBRATION_SKIP_BLINK_RATIO):
            return False, "avoid blinking"
        if mar > (ref_mar * CALIBRATION_SKIP_YAWN_RATIO):
            return False, "close your mouth"
        return True, ""

    def _frame_quality_side(
        self,
        stage_name,
        ear,
        yaw,
        pitch,
        mar,
        left_span,
        right_span,
        gaze_h,
        gaze_v,
        ear_confidence,
        gaze_confidence,
        yaw_rate,
        pitch_rate,
    ):
        yaw_delta = float(yaw - (self.baseline_yaw or 0.0))
        expected_sign = LEFT_MIRROR_EXPECTED_SIGN if stage_name == "LEFT_MIRROR" else RIGHT_MIRROR_EXPECTED_SIGN
        stage_label = "left" if stage_name == "LEFT_MIRROR" else "right"

        if abs(yaw_delta) < max(4.0, MIRROR_CALIBRATION_MIN_YAW - 2.0):
            return False, f"turn farther toward the {stage_label} mirror"
        if np.sign(yaw_delta) != np.sign(expected_sign) and abs(yaw_delta) > CALIBRATION_DIRECTION_MARGIN_DEG:
            return False, f"turn toward the {stage_label} mirror"
        if yaw_rate > CALIBRATION_MAX_YAW_RATE or pitch_rate > CALIBRATION_MAX_PITCH_RATE:
            return False, "hold that mirror pose steadier"
        if ear_confidence < max(0.45, CALIBRATION_GOOD_EAR_CONF_MIN - 0.10):
            return False, "eyes are not clear enough"
        if self.baseline_mar is not None and mar > (self.baseline_mar * 1.35):
            return False, "keep your mouth closed"

        if gaze_confidence < CALIBRATION_GOOD_GAZE_CONF_MIN:
            self.stage_modes[stage_name] = "yaw_only"
        return True, ""

    def _stage_ready(self):
        _, frame_target, _ = self.STAGES[self.stage_index]
        return len(self.stage_samples[self.current_stage_name]["ear"]) >= frame_target

    def _validate_forward_stage(self):
        stage = self.stage_samples["FORWARD"]
        ear_arr = np.asarray(stage["ear"], dtype=np.float32)
        yaw_arr = np.asarray(stage["yaw"], dtype=np.float32)
        pitch_arr = np.asarray(stage["pitch"], dtype=np.float32)
        mar_arr = np.asarray(stage["mar"], dtype=np.float32)

        ear_std = float(np.std(ear_arr))
        yaw_std = float(np.std(yaw_arr))
        pitch_std = float(np.std(pitch_arr))
        yaw_med = float(np.median(yaw_arr))

        blink_like_ratio = float(np.mean(ear_arr < (np.median(ear_arr) * 0.82)))
        yawn_like_ratio = float(np.mean(mar_arr > (np.median(mar_arr) * 1.30)))

        reject_reasons = []
        # Still protect against obviously bad forward posture, but do not demand near-zero yaw.
        if abs(yaw_med) > CALIBRATION_FORWARD_HARD_MAX_ABS_YAW:
            reject_reasons.append(f"forward pose is too far off-center (yaw={yaw_med:.1f})")
        if ear_std > CALIBRATION_MAX_EAR_STD or yaw_std > CALIBRATION_MAX_YAW_STD or pitch_std > CALIBRATION_MAX_PITCH_STD:
            reject_reasons.append(
                f"forward pose not stable enough (yaw_std={yaw_std:.2f}, pitch_std={pitch_std:.2f}, ear_std={ear_std:.3f})"
            )
        if blink_like_ratio > CALIBRATION_MAX_BLINK_RATIO:
            reject_reasons.append("too many blink or closure samples")
        if yawn_like_ratio > CALIBRATION_MAX_YAWN_RATIO:
            reject_reasons.append("mouth not neutral during forward calibration")
        return reject_reasons

    def _validate_side_stage(self, stage_name):
        stage = self.stage_samples[stage_name]
        yaw_arr = np.asarray(stage["yaw"], dtype=np.float32) - float(self.baseline_yaw or 0.0)
        mar_arr = np.asarray(stage["mar"], dtype=np.float32)
        gaze_conf_arr = np.asarray(stage["gaze_conf"], dtype=np.float32) if stage["gaze_conf"] else np.asarray([], dtype=np.float32)

        yaw_med = float(np.median(yaw_arr))
        yaw_std = float(np.std(yaw_arr))
        mar_med = float(np.median(mar_arr))

        expected_sign = LEFT_MIRROR_EXPECTED_SIGN if stage_name == "LEFT_MIRROR" else RIGHT_MIRROR_EXPECTED_SIGN
        stage_label = "left" if stage_name == "LEFT_MIRROR" else "right"

        reject_reasons = []
        if abs(yaw_med) < MIRROR_CALIBRATION_MIN_YAW:
            reject_reasons.append(f"turn farther toward the {stage_label} mirror")
        if np.sign(yaw_med) != np.sign(expected_sign):
            reject_reasons.append(f"stage direction does not match the {stage_label} mirror")
        if yaw_std > (CALIBRATION_MAX_YAW_STD + 3.0):
            reject_reasons.append("mirror pose not steady enough")
        if self.baseline_mar is not None and mar_med > (self.baseline_mar * 1.35):
            reject_reasons.append("keep mouth closed during mirror calibration")
        if len(gaze_conf_arr) and float(np.median(gaze_conf_arr)) < (GAZE_CONFIDENCE_MIN * 0.55):
            self.stage_modes[stage_name] = "yaw_only"
        return reject_reasons

    def _compute_forward_baselines(self):
        stage = self.stage_samples["FORWARD"]
        ear_arr = np.asarray(stage["ear"], dtype=np.float32)
        yaw_arr = np.asarray(stage["yaw"], dtype=np.float32)
        pitch_arr = np.asarray(stage["pitch"], dtype=np.float32)
        mar_arr = np.asarray(stage["mar"], dtype=np.float32)
        left_span_arr = np.asarray(stage["left_span"], dtype=np.float32)
        right_span_arr = np.asarray(stage["right_span"], dtype=np.float32)
        ear_conf_arr = np.asarray(stage["ear_conf"], dtype=np.float32)
        gaze_h_arr = np.asarray(stage["gaze_h"], dtype=np.float32) if stage["gaze_h"] else np.asarray([], dtype=np.float32)
        gaze_v_arr = np.asarray(stage["gaze_v"], dtype=np.float32) if stage["gaze_v"] else np.asarray([], dtype=np.float32)
        gaze_conf_arr = np.asarray(stage["gaze_conf"], dtype=np.float32) if stage["gaze_conf"] else np.asarray([], dtype=np.float32)

        ear_keep_floor = float(np.percentile(ear_arr, 35))
        mar_keep_ceil = float(np.percentile(mar_arr, 60))

        ear_open_samples = ear_arr[ear_arr >= ear_keep_floor]
        mar_neutral_samples = mar_arr[mar_arr <= mar_keep_ceil]

        self.baseline_ear = float(np.mean(ear_open_samples)) if len(ear_open_samples) else float(np.mean(ear_arr))
        self.baseline_yaw = float(np.median(yaw_arr))
        self.baseline_pitch = float(np.median(pitch_arr))
        self.baseline_mar = float(np.mean(mar_neutral_samples)) if len(mar_neutral_samples) else float(np.mean(mar_arr))
        self.max_left_span = float(np.percentile(left_span_arr, 90))
        self.max_right_span = float(np.percentile(right_span_arr, 90))

        left_vis = left_span_arr / (self.max_left_span + 1e-6)
        right_vis = right_span_arr / (self.max_right_span + 1e-6)
        self.baseline_eye_visibility = float(np.median(np.minimum(left_vis, right_vis)))
        self.baseline_ear_confidence = float(np.median(ear_conf_arr)) if len(ear_conf_arr) else 1.0

        if len(gaze_h_arr):
            if len(gaze_conf_arr):
                mask = gaze_conf_arr >= GAZE_CONFIDENCE_MIN
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

    @staticmethod
    def _expand_range(low, high, margin, clip_low=None, clip_high=None):
        low = float(low - margin)
        high = float(high + margin)
        if clip_low is not None:
            low = max(clip_low, low)
        if clip_high is not None:
            high = min(clip_high, high)
        return (low, high)

    def _stage_summary(self, stage_name):
        stage = self.stage_samples[stage_name]
        yaw_delta = np.asarray(stage["yaw"], dtype=np.float32) - float(self.baseline_yaw or 0.0)
        gaze_h_arr = np.asarray(stage["gaze_h"], dtype=np.float32) if stage["gaze_h"] else np.asarray([], dtype=np.float32)
        gaze_conf_arr = np.asarray(stage["gaze_conf"], dtype=np.float32) if stage["gaze_conf"] else np.asarray([], dtype=np.float32)

        if len(gaze_h_arr) and len(gaze_conf_arr):
            mask = gaze_conf_arr >= GAZE_CONFIDENCE_MIN
            gaze_use = gaze_h_arr[mask] if np.any(mask) else gaze_h_arr
        else:
            gaze_use = gaze_h_arr if len(gaze_h_arr) else np.asarray([self.baseline_gaze_h], dtype=np.float32)

        return {
            "yaw_med": float(np.median(yaw_delta)),
            "yaw_p20": float(np.percentile(yaw_delta, 20)),
            "yaw_p80": float(np.percentile(yaw_delta, 80)),
            "gaze_p25": float(np.percentile(gaze_use, 25)),
            "gaze_p75": float(np.percentile(gaze_use, 75)),
            "mode": self.stage_modes.get(stage_name, "full"),
        }

    def _retry_specific_stage(self, stage_name, reason):
        self.stage_fail_counts[stage_name] += 1
        self.last_reject_reason = reason
        if self.stage_fail_counts[stage_name] > CALIBRATION_MAX_AUTO_RETRIES:
            self.pause_required = True
            self.stage_phase = "PAUSED"
            return False
        self.pause_required = False
        self._start_stage(stage_name)
        return False

    def _finalize_side_ranges(self):
        left = self._stage_summary("LEFT_MIRROR")
        right = self._stage_summary("RIGHT_MIRROR")

        # Keep successful data if only one side is inconsistent.
        if np.sign(left["yaw_med"]) == np.sign(right["yaw_med"]):
            weaker = "LEFT_MIRROR" if abs(left["yaw_med"]) < abs(right["yaw_med"]) else "RIGHT_MIRROR"
            return self._retry_specific_stage(weaker, "left and right mirror looks are not distinct enough")

        negative = left if left["yaw_med"] < right["yaw_med"] else right
        positive = right if negative is left else left

        if negative["yaw_med"] >= -MIRROR_CALIBRATION_MIN_YAW:
            return self._retry_specific_stage("LEFT_MIRROR", "left mirror turn is not strong enough")
        if positive["yaw_med"] <= MIRROR_CALIBRATION_MIN_YAW:
            return self._retry_specific_stage("RIGHT_MIRROR", "right mirror turn is not strong enough")

        self.negative_mirror_yaw_range = self._expand_range(
            negative["yaw_p20"], negative["yaw_p80"], 4.0,
            clip_low=-(DISTRACTION_YAW_THRESHOLD - 4.0),
            clip_high=-MIRROR_YAW_THRESHOLD,
        )
        self.positive_mirror_yaw_range = self._expand_range(
            positive["yaw_p20"], positive["yaw_p80"], 4.0,
            clip_low=MIRROR_YAW_THRESHOLD,
            clip_high=(DISTRACTION_YAW_THRESHOLD - 4.0),
        )

        if negative["mode"] == "full":
            self.negative_mirror_gaze_range = self._expand_range(
                negative["gaze_p25"], negative["gaze_p75"], GAZE_MIRROR_DELTA_MIN * 0.8,
                clip_low=0.0, clip_high=1.0,
            )
        else:
            self.negative_mirror_gaze_range = None

        if positive["mode"] == "full":
            self.positive_mirror_gaze_range = self._expand_range(
                positive["gaze_p25"], positive["gaze_p75"], GAZE_MIRROR_DELTA_MIN * 0.8,
                clip_low=0.0, clip_high=1.0,
            )
        else:
            self.positive_mirror_gaze_range = None

        self.left_mirror_gaze_range = self.negative_mirror_gaze_range
        self.right_mirror_gaze_range = self.positive_mirror_gaze_range
        self.mirror_reference_yaw = float((abs(negative["yaw_med"]) + abs(positive["yaw_med"])) / 2.0)
        return True

    def export_profile(self):
        return {
            "profile_version": self.profile_version,
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
            "stage_modes": self.stage_modes,
        }

    def load_profile(self, data):
        self.profile_version = int(data.get("profile_version", 1))
        self.baseline_ear = data.get("baseline_ear")
        self.baseline_yaw = data.get("baseline_yaw")
        self.baseline_pitch = data.get("baseline_pitch")
        self.baseline_mar = data.get("baseline_mar")
        self.baseline_gaze_h = data.get("baseline_gaze_h")
        self.baseline_gaze_v = data.get("baseline_gaze_v")
        self.max_left_span = data.get("max_left_span")
        self.max_right_span = data.get("max_right_span")
        self.baseline_eye_visibility = data.get("baseline_eye_visibility")
        self.baseline_ear_confidence = data.get("baseline_ear_confidence")
        self.negative_mirror_gaze_range = data.get("negative_mirror_gaze_range")
        self.positive_mirror_gaze_range = data.get("positive_mirror_gaze_range")
        self.negative_mirror_yaw_range = data.get("negative_mirror_yaw_range")
        self.positive_mirror_yaw_range = data.get("positive_mirror_yaw_range")
        self.left_mirror_gaze_range = data.get("left_mirror_gaze_range")
        self.right_mirror_gaze_range = data.get("right_mirror_gaze_range")
        self.mirror_reference_yaw = data.get("mirror_reference_yaw")
        self.angle_factor = data.get("angle_factor", 0.0)
        self.ear_fatigue_threshold = data.get("ear_fatigue_threshold")
        self.ear_closed_threshold = data.get("ear_closed_threshold")
        self.mar_yawn_threshold = data.get("mar_yawn_threshold")
        self.blink_threshold = data.get("blink_threshold")
        self.stage_modes = data.get("stage_modes", self.stage_modes)
        self.calibrated = True
        self.pause_required = False
        self.stage_phase = "DONE"
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
        if self.calibrated or self.pause_required:
            return self.calibrated

        yaw_rate, pitch_rate, now = self._update_pose_rate(yaw, pitch)
        stage_name = self.current_stage_name
        timeout = (now - self.stage_started_at) > CALIBRATION_STAGE_TIMEOUT_SEC

        if stage_name == "FORWARD":
            ok, reason = self._frame_quality_forward(
                ear, yaw, pitch, mar,
                left_span, right_span,
                ear_confidence, gaze_confidence,
                yaw_rate, pitch_rate,
            )
            max_bad_frames = CALIBRATION_FORWARD_MAX_BAD_FRAMES
        else:
            ok, reason = self._frame_quality_side(
                stage_name,
                ear, yaw, pitch, mar,
                left_span, right_span,
                gaze_h, gaze_v,
                ear_confidence, gaze_confidence,
                yaw_rate, pitch_rate,
            )
            max_bad_frames = CALIBRATION_SIDE_MAX_BAD_FRAMES

        if not ok:
            self.last_skip_reason = reason
            self.bad_frame_count += 1
            self.stable_count = 0
            if timeout or self.bad_frame_count >= max_bad_frames:
                return self._retry_specific_stage(stage_name, reason)
            return False

        self.last_skip_reason = ""
        self.stable_count += 1
        if self.stage_phase == "WAIT_STABLE":
            if self.stable_count < CALIBRATION_PRE_STABLE_FRAMES:
                return False
            self.stage_phase = "COLLECT"

        self._append_current(
            ear, yaw, pitch, mar,
            left_span, right_span,
            gaze_h, gaze_v,
            gaze_confidence,
            ear_confidence,
        )
        self.good_frame_count += 1

        if not self._stage_ready():
            return False

        if stage_name == "FORWARD":
            reject_reasons = self._validate_forward_stage()
            if reject_reasons:
                return self._retry_specific_stage(stage_name, "; ".join(reject_reasons))
            self._compute_forward_baselines()
            self.stage_index += 1
            self._start_stage(self.current_stage_name)
            self.last_info_message = "Forward baseline accepted. Now calibrating mirror looks."
            return False

        reject_reasons = self._validate_side_stage(stage_name)
        if reject_reasons:
            return self._retry_specific_stage(stage_name, "; ".join(reject_reasons))

        if self.stage_index < len(self.STAGES) - 1:
            self.stage_index += 1
            self._start_stage(self.current_stage_name)
            return False

        if not self._finalize_side_ranges():
            return False

        self.calibrated = True
        self.stage_phase = "DONE"
        self.last_skip_reason = ""
        self.last_reject_reason = ""
        return True
```

## Why this design is better

### What changes behaviorally
- A blink costs one skipped frame, not the whole stage.
- The system now waits until the pose is stable before collecting.
- Forward calibration learns the actual neutral baseline.
- Mirror stages can retry independently.
- The system can pause after repeated failure instead of looping forever.
- Mirror calibration can still succeed in yaw-only mode when gaze confidence is weak.

---

## 4.4 `main.py` — How to Integrate the New Calibration Design

## Required changes
1. Remove the duplicate `draw_calibration()` function.
2. Import and call `reset_head_pose_smoothing()` when recalibrating.
3. Actually wire `manual_retry_required` to `calibrator.pause_required`.
4. Surface `last_skip_reason` on screen.
5. Save calibration profiles after success and optionally load them on startup.
6. Add a measurement-quality layer.

### Reference patch ideas

#### A. Import pose reset

```python
from face_metrics import get_dominant_ear, get_mar, get_head_pose, reset_head_pose_smoothing
```

#### B. Reset pose smoothing during recalibration

```python
def reset_calibration(source="manual"):
    nonlocal calibrator
    nonlocal drowsiness
    nonlocal state_machine
    nonlocal attention_tracker
    nonlocal calibration_source
    nonlocal calibration_attempt
    nonlocal calibration_auto_retry_used
    nonlocal manual_retry_required
    nonlocal last_progress_reported
    nonlocal last_reject_reported
    nonlocal calibration_active
    nonlocal event_timers
    nonlocal prev_yaw_for_rate
    nonlocal prev_metric_time

    reset_head_pose_smoothing()

    calibrator = Calibrator()
    drowsiness = DrowsinessDetector()
    state_machine = StateMachine()
    attention_tracker = GazeAttentionTracker()
    event_timers = {key: None for key in event_timers}
    prev_yaw_for_rate = None
    prev_metric_time = None

    calibration_source = source
    calibration_attempt = 1
    calibration_auto_retry_used = False
    manual_retry_required = False
    last_progress_reported = -1
    last_reject_reported = ""
    calibration_active = True
```

#### C. Pause when the calibrator asks for it

```python
calibrator.update(
    ear, yaw, pitch, mar,
    left_span, right_span,
    gaze_h=gaze_h, gaze_v=gaze_v,
    ear_confidence=ear_confidence,
    gaze_confidence=gaze_meta.get("gaze_confidence", 0.0),
)

manual_retry_required = calibrator.pause_required
```

#### D. Show skip reason while calibrating

```python
draw_calibration(
    frame,
    calibrator.progress,
    calibrator.instruction,
    calibrator.last_reject_reason or calibrator.last_skip_reason,
    calibrator.current_stage_name,
)
```

#### E. Show a separate live line for skip reason

```python
if calibrator.last_skip_reason:
    cv2.putText(
        frame,
        f"Live: {calibrator.last_skip_reason[:70]}",
        (10, 156),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.45,
        (0, 180, 255),
        1,
    )
```

#### F. Save profile after calibration completes

```python
from pathlib import Path
import json

PROFILE_PATH = Path(__file__).resolve().parent / "calibration_profile.json"


def save_calibration_profile(calibrator, camera_index, width, height):
    payload = {
        "camera_index": camera_index,
        "frame_width": width,
        "frame_height": height,
        "saved_at": time.time(),
        "profile": calibrator.export_profile(),
    }
    PROFILE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def try_load_calibration_profile(calibrator, camera_index, width, height):
    if not PROFILE_PATH.exists():
        return False
    try:
        payload = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return False

    if payload.get("camera_index") != camera_index:
        return False
    if payload.get("frame_width") != width or payload.get("frame_height") != height:
        return False

    profile = payload.get("profile")
    if not isinstance(profile, dict):
        return False

    return calibrator.load_profile(profile)
```

#### G. Try loading at startup

```python
calibrator = Calibrator()
if try_load_calibration_profile(calibrator, CAMERA_INDEX, FRAME_WIDTH, FRAME_HEIGHT):
    calibration_active = False
    print("[INFO] Loaded saved calibration profile.")
else:
    calibration_active = False
    print("[INFO] No valid saved calibration profile found. Start calibration from UI.")
```

### Why these `main.py` changes matter
`main.py` is the orchestration point. Even if the calibration module improves, the overall behavior will still feel broken unless:
- the pose reset is called,
- manual pause is respected,
- live skip reasons are shown,
- persistent profiles are used.

---

## 4.5 Add a Shared Measurement Quality Layer

This is the next most important structural change after calibration.

## Why it is needed
Right now, confidence signals exist, but each subsystem handles them differently.
That causes inconsistent behavior.

A single shared quality object should be created once per frame and passed into:
- drowsiness logic,
- attention logic,
- state arbitration.

### Reference code

```python
# signal_quality.py or inline in main.py
from dataclasses import dataclass


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

    pose_stable = yaw_rate <= 25.0 and pitch_rate <= 20.0

    score = (
        0.35 * float(max(0.0, min(1.0, ear_confidence))) +
        0.25 * float(max(0.0, min(1.0, gaze_confidence))) +
        0.25 * float(max(0.0, min(1.0, eye_visibility))) +
        0.15 * (1.0 if pose_stable else 0.35)
    )

    level = classify_quality_level(score)

    if eye_visibility < 0.35:
        reason = "eye visibility too low"
    elif ear_confidence < 0.35:
        reason = "ear confidence too low"
    elif gaze_confidence < 0.25:
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
        level=level,
        reason=reason,
    )
```

### Principle this enforces
**Low confidence should reduce certainty, not create strong negative labels.**

That principle should be used everywhere below.

---

## 4.6 View-Aware EAR Normalization

This change improves drowsiness and microsleep reliability.

## Why it is needed
A side view often reduces measured EAR even when the eye is open.
If you only use raw EAR, the system can create false fatigue or false microsleep during side glances.

### Simple reference implementation

```python
import numpy as np


def expected_open_ear(calibrator, yaw, eye_visibility):
    baseline = float(calibrator.baseline_ear or 0.25)
    yaw_mag = min(abs(float(yaw)) / 35.0, 1.0)
    vis_penalty = max(0.0, 1.0 - float(eye_visibility))

    # The more sideways / occluded the face is, the more raw EAR is expected to shrink.
    side_comp = 1.0 - (0.10 * yaw_mag + 0.08 * vis_penalty)
    side_comp = float(np.clip(side_comp, 0.72, 1.0))
    return baseline * side_comp



def normalize_ear(calibrator, ear, yaw, eye_visibility):
    exp_open = max(1e-6, expected_open_ear(calibrator, yaw, eye_visibility))
    return float(ear) / exp_open
```

### How to use it
Instead of comparing only:

```python
ear_filtered < calibrator.ear_fatigue_threshold
```

you can also compare normalized EAR:

```python
ear_norm = normalize_ear(calibrator, ear_filtered, yaw, quality.eye_visibility)
fatigue_candidate = ear_norm < 0.92
closed_candidate = ear_norm < 0.82
```

### Why a real system should do this
Because the observed eye aperture changes with pose. A production-like system should compensate for view, not pretend all views are equally measurable.

---

## 4.7 `drowsiness.py` — How the Logic Should Change

## What should remain
Keep the useful building blocks:
- EAR smoothing,
- blink duration tracking,
- PERCLOS,
- low-EAR hold,
- head nod,
- microsleep timer.

## What should change
1. Use shared quality.
2. Use normalized EAR.
3. Distinguish mild fatigue from strong closure.
4. Require stronger evidence for microsleep.
5. Weight low-quality frames less in PERCLOS-like reasoning.

### Example logic policy

#### Fatigue candidate
Should require either:
- normalized EAR low for a short time, or
- slow blink pattern, or
- PERCLOS rising,

with at least `LOW` to `MEDIUM` measurement quality.

#### Microsleep candidate
Should require:
- strong normalized closure,
- duration,
- support evidence such as PERCLOS / slow blink / head nod,
- and not be explainable by mirror-protected side behavior.

### Reference pattern for microsleep gate

```python
def microsleep_gate(
    ear_norm,
    quality,
    support_present,
    mirror_protected,
    side_turn,
):
    if quality.level == "INSUFFICIENT":
        return False, "insufficient measurement quality"

    if mirror_protected and quality.ear_confidence < 0.70 and not support_present:
        return False, "mirror-protected side view with weak eye evidence"

    if side_turn and quality.ear_confidence < 0.50 and not support_present:
        return False, "side-view eye evidence too weak"

    if ear_norm < 0.80 and support_present:
        return True, "strong closure with support"

    return False, "not enough evidence"
```

### Real-system argument
Microsleep should be rare and serious. That means the system must be more conservative before raising it.

---

## 4.8 `iris_gaze.py` — Mirror Logic Should Change

## Desired behavior
Mirror logic should have **two valid operating modes**:

### Mode A — full mode
Use calibrated yaw band + calibrated gaze band.

### Mode B — yaw-only fallback mode
Use calibrated yaw band only when gaze confidence is weak.

## Why this is necessary
Because mirror checks happen at side angles where iris tracking quality often drops.
Without fallback, the system becomes weakest exactly where mirror recognition is most needed.

### Reference integration idea in `evaluate()`

```python
# inside GazeAttentionTracker.evaluate(...)
neg_yaw_range = getattr(calibrator, "negative_mirror_yaw_range", None) if calibrator else None
pos_yaw_range = getattr(calibrator, "positive_mirror_yaw_range", None) if calibrator else None
neg_gaze_range = getattr(calibrator, "negative_mirror_gaze_range", None) if calibrator else None
pos_gaze_range = getattr(calibrator, "positive_mirror_gaze_range", None) if calibrator else None

mirror_candidate = False
yaw_only_candidate = False

if yaw < 0 and neg_yaw_range is not None:
    yaw_only_candidate = neg_yaw_range[0] <= yaw <= neg_yaw_range[1]
    if yaw_only_candidate and neg_gaze_range is not None and gaze_conf >= GAZE_CONFIDENCE_MIN:
        mirror_candidate = neg_gaze_range[0] <= gaze_h <= neg_gaze_range[1]
    elif yaw_only_candidate and neg_gaze_range is None:
        mirror_candidate = True

elif yaw > 0 and pos_yaw_range is not None:
    yaw_only_candidate = pos_yaw_range[0] <= yaw <= pos_yaw_range[1]
    if yaw_only_candidate and pos_gaze_range is not None and gaze_conf >= GAZE_CONFIDENCE_MIN:
        mirror_candidate = pos_gaze_range[0] <= gaze_h <= pos_gaze_range[1]
    elif yaw_only_candidate and pos_gaze_range is None:
        mirror_candidate = True

# fallback: if gaze is weak but the yaw band is strongly matched,
# keep a mirror candidate with lower certainty.
if not mirror_candidate and yaw_only_candidate and gaze_conf < GAZE_CONFIDENCE_MIN:
    mirror_candidate = True
```

### Additional recommendation
Return an explicit confidence / certainty field from gaze attention, for example:

```python
meta["attention_confidence"] = 0.80 if full gaze+yaw match else 0.60 if yaw_only_candidate else 0.30
```

---

## 4.9 `state_machine.py` — Recommended Behavior (Even Though File Was Not Reviewed)

The state machine should not just smooth raw labels. It should explicitly arbitrate between event candidates.

## Recommended priority
A practical order is:
1. `NO FACE`
2. `PHONE USE`
3. `MICROSLEEP`
4. `DROWSY`
5. `FATIGUED`
6. `YAWNING`
7. `DISTRACTED`
8. `EYES OFF ROAD`
9. `LOOKING DOWN`
10. `MIRROR CHECK`
11. `ALERT`

## Why that order makes sense
- `PHONE USE` is explicit dangerous evidence.
- `MICROSLEEP` is severe and should dominate softer states.
- `MIRROR CHECK` is protected normal behavior and should not outrank danger states, but it should suppress false distraction escalation.

### Reference arbitration pattern

```python
def choose_driver_state(candidates):
    if candidates.get("no_face"):
        return "NO FACE"
    if candidates.get("phone_use"):
        return "PHONE USE"
    if candidates.get("microsleep"):
        return "MICROSLEEP"
    if candidates.get("drowsy"):
        return "DROWSY"
    if candidates.get("fatigued"):
        return "FATIGUED"
    if candidates.get("yawning"):
        return "YAWNING"
    if candidates.get("distracted"):
        return "DISTRACTED"
    if candidates.get("eyes_off_road"):
        return "EYES OFF ROAD"
    if candidates.get("looking_down"):
        return "LOOKING DOWN"
    if candidates.get("mirror_check"):
        return "MIRROR CHECK"
    return "ALERT"
```

### Better version
In practice, the state machine should use:
- candidate strength,
- entry timers,
- exit grace,
- measurement quality,
- protection flags.

---

## Part 5 — What Should Change in Each High-Level Behavior

## 5.1 Drowsiness

### Current direction
Already partly good, but not quality-central enough.

### Desired redesign
Use:
- normalized EAR,
- blink history,
- PERCLOS trend,
- low-EAR hold,
- quality-aware suppression.

### Real behavior target
The system should not call a driver drowsy just because a side-view eye became harder to see.
It should call drowsiness when the **evidence is persistent and credible**.

---

## 5.2 Microsleep

### Desired redesign
Microsleep should require:
- sustained strong closure,
- support evidence,
- adequate measurement quality,
- no better explanation such as mirror-protected side behavior.

### Real behavior target
Microsleep should be hard to trigger falsely.

---

## 5.3 Yawning

### Desired redesign
A yawn should require:
- sustained high MAR,
- enough mouth stability,
- enough tracking confidence,
- not just brief speech-like motion.

### Real behavior target
A yawn is not simply “mouth open.” It is a sustained mouth-opening event.

### Practical addition
Track MAR slope and duration, not just threshold crossing.

```python
def yawn_candidate(mar, mar_threshold, high_mar_elapsed, yaw, quality):
    if quality.level == "INSUFFICIENT":
        return False
    if abs(yaw) > 35.0 and quality.overall < 0.55:
        return False
    return mar > mar_threshold and high_mar_elapsed >= 0.5
```

---

## 5.4 Distraction / Eyes Off Road

### Desired redesign
Use separate layers:
- mirror candidate,
- off-road candidate,
- distracted confirmed.

### Real behavior target
A short side glance should not immediately become `DISTRACTED`.
A prolonged or excessive off-road glance should.

### Practical rule
- short protected side glance -> `MIRROR CHECK`
- short unprotected off-road glance -> `EYES OFF ROAD`
- prolonged or stronger off-road attention -> `DISTRACTED`

---

## 5.5 Looking Down / Phone in Lap / Phone Use

### Desired redesign
Three-level separation:
- `LOOKING DOWN`
- `PHONE IN LAP`
- `PHONE USE`

### Real behavior target
The system should distinguish casual dashboard glances from sustained lap attention and from confirmed phone usage.

### Suggested logic
- downward pitch/gaze for a short time -> `LOOKING DOWN`
- downward pitch/gaze with open-eye evidence and stronger hold -> `PHONE IN LAP`
- phone detector hit or persistent phone pattern -> `PHONE USE`

---

## 5.6 Mirror View

### Desired redesign
Mirror recognition should:
- be calibrated,
- be protected,
- use duration bounds,
- use gaze when available,
- fall back to yaw when needed,
- escalate only when it lasts too long or exceeds expected range.

### Real behavior target
Mirror checking is valid behavior. The system should model it as such.

---

## Part 6 — Suggested Main-Loop Flow After Refactor

Below is the behavior the main loop should move toward.

```python
# Pseudocode structure
extract raw signals
build measurement quality

if not calibrated:
    calibration_controller.update(raw signals)
    render calibration UI
    continue

normalize signals relative to baseline
build event candidates
apply temporal confirmation
resolve conflicts / protections
choose state
render UI
log row
send alerts
```

## Candidate layering idea

```python
candidates = {
    "mirror_check": False,
    "eyes_off_road": False,
    "distracted": False,
    "looking_down": False,
    "phone_in_lap": False,
    "phone_use": False,
    "fatigued": False,
    "drowsy": False,
    "microsleep": False,
    "yawning": False,
}
```

Then fill these using:
- normalized eye evidence,
- gaze / yaw evidence,
- phone detector evidence,
- quality,
- timing.

---

## Part 7 — Logging and Offline Validation

This is essential if you want the system to become truly reliable.

## Why logging is needed
Without logs, you are guessing.
With logs, you can see exactly:
- what signal changed,
- why a state triggered,
- whether the calibration was clean,
- where false positives came from.

### Recommended CSV logger

```python
import csv
from pathlib import Path


class CSVEventLogger:
    def __init__(self, path):
        self.path = Path(path)
        self._file = self.path.open("a", newline="", encoding="utf-8")
        self._writer = csv.writer(self._file)
        if self.path.stat().st_size == 0:
            self._writer.writerow([
                "ts",
                "state",
                "raw_state",
                "ear",
                "ear_filtered",
                "ear_conf",
                "ear_norm",
                "mar",
                "perclos",
                "yaw",
                "pitch",
                "yaw_rate",
                "gaze_h",
                "gaze_v",
                "gaze_conf",
                "attention",
                "mirror_elapsed",
                "phone_detected",
                "phone_conf",
                "quality_level",
                "quality_score",
                "quality_reason",
                "reason",
            ])

    def write(self, row):
        self._writer.writerow(row)
        self._file.flush()

    def close(self):
        self._file.close()
```

### What scenarios to record
- good forward calibration,
- forward with one blink,
- left mirror,
- right mirror,
- quick side glance,
- prolonged side glance,
- looking down at dashboard,
- phone in lap pattern,
- real blink,
- slow blink,
- true eye closure,
- yawn,
- glasses,
- low light.

---

## Part 8 — Step-by-Step Implementation Order

## Phase 1 — Fix the calibration reliability path first
1. Add `reset_head_pose_smoothing()`.
2. Call it inside `reset_calibration()`.
3. Replace current calibration buffering with stable-gated frame collection.
4. Add live `last_skip_reason`.
5. Add per-stage retry count and pause behavior.
6. Add side-direction enforcement.
7. Add yaw-only mirror fallback.

## Phase 2 — Make runtime identification more trustworthy
8. Add `MeasurementQuality`.
9. Add view-aware EAR normalization.
10. Update fatigue / microsleep logic to use quality and normalized EAR.
11. Update gaze logic to return fallback certainty.
12. Refine state arbitration.

## Phase 3 — Productize and tune
13. Save/load calibration profiles.
14. Add CSV logging.
15. Run scenario tests.
16. Tune thresholds using logs.

---

## Part 9 — Acceptance Criteria

A redesign should not be considered complete until it passes these checks.

## Calibration acceptance
- Forward calibration succeeds without repeated retries when the user is stable.
- One blink does not fail the stage.
- Brief mouth movement causes skipped frames, not automatic full-stage failure.
- Slight off-center camera placement still allows forward calibration.
- Left mirror and right mirror are collected separately and deterministically.
- Poor iris quality in side stages can still succeed in yaw-only mode.
- Repeated stage failure pauses clearly instead of looping forever.

## Runtime acceptance
- Quick mirror check -> `MIRROR CHECK`, not `DISTRACTED`.
- Long off-road side glance -> `DISTRACTED`.
- Brief down glance -> mild `LOOKING DOWN` at most.
- Strong lap-look pattern -> `PHONE IN LAP`.
- Phone detector hit -> `PHONE USE`.
- Side-view weak EAR does not create false drowsiness.
- Strong real closure with support can still create `MICROSLEEP`.
- Yawning requires sustained MAR, not one brief mouth opening.

---

## Part 10 — Final Engineering Recommendation

## What should be kept
Keep the existing useful signal extraction pieces:
- EAR extraction,
- MAR extraction,
- gaze extraction,
- head pose,
- blink tracking,
- PERCLOS,
- head nod,
- mirror timing.

## What should be redesigned
Redesign these parts:
- calibration control flow,
- retry policy,
- pose reset behavior,
- quality handling,
- view-aware normalization,
- candidate generation,
- state arbitration.

## Final conclusion
This is **not** mainly a threshold problem.
It is a **control-logic and evidence-model problem**.

The correct real-system behavior is:
- collect only clean calibration frames,
- learn the actual driver baseline,
- treat uncertainty as uncertainty,
- protect normal driving behaviors like mirror checks,
- require stronger evidence for severe states,
- use hysteresis and quality-aware state decisions.

If you implement the changes in this document in the order listed, the system should become much more stable, much less frustrating to calibrate, and much more believable in real use.
