# SISURAKSHA — Calibration and Detection Change Document

## Purpose

This document lists the changes that should be made to the current driver-monitoring system so calibration becomes reliable and the runtime states behave more like a real system.

It is based on the current code you shared:
- `calibration.py`
- `main.py`
- `face_metrics.py`
- `config.py`
- `drowsiness.py`
- `iris_gaze.py`

The focus is:
1. Fix why calibration keeps failing with messages like `too many unstable frames` and `stage timeout`.
2. Make calibration fair, stable, and repeatable.
3. Improve how the full system identifies drowsiness, microsleep, yawn, distraction, mirror checks, and looking down.
4. Align the implementation with how a real driver-monitoring system should behave.

---

## 1. Current Problem Summary

### Main symptom
Calibration often fails with messages such as:
- `too many unstable frames`
- `calibration retry`
- `stage timeout`
- `hold the requested pose more steadily`

### What this means in practice
The current calibration flow is still too fragile. It rejects stages too quickly even when the user is mostly doing the correct pose.

### Why this happens
There are several code-level reasons:

1. **The stage timeout starts too early.**
   In the current `calibration.py`, `stage_capture_started_at` is set before the stage has actually reached a stable pose and before it has accepted good samples. That means the timer can expire while the user is still trying to satisfy stability requirements.

2. **Every bad frame is treated too harshly.**
   When `skip_reason` is returned, the code resets `stage_stable_count = 0`. Even one noisy frame can destroy progress. A blink, small mouth motion, or one jittery pose estimate can cause repeated retries.

3. **The pose stability gate is too sensitive to head-pose jitter.**
   `face_metrics.py` uses `cv2.solvePnP()` plus EMA smoothing. In `calibration.py`, that pose is converted into yaw-rate and pitch-rate. Small landmark noise can look like big deg/sec motion, so the user gets `hold still` even when they are almost steady.

4. **Head-pose smoothing is not reset when recalibration starts.**
   The smoother in `face_metrics.py` is module-level state. `main.py` rebuilds the calibrator and detectors, but does not reset the pose smoothing variables. So the new calibration can inherit motion history from the old one.

5. **The pause/retry flow is incomplete.**
   `calibration.py` has `pause_required`, but `main.py` does not properly mirror that into `manual_retry_required`, so the UI flow becomes inconsistent after retries are exhausted.

6. **The calibration/config files are out of sync.**
   The current `calibration.py` imports many constants that are not present in the uploaded `config.py`. That means the actual running project either has a different config file or is currently inconsistent. That must be fixed first.

7. **The overall architecture is still too threshold-driven.**
   The runtime detectors already include good ideas like EAR confidence, gaze confidence, mirror protection, PERCLOS, and head nod support, but the system still needs a clearer separation between:
   - raw measurements
   - measurement quality
   - candidate events
   - confirmed driver state

---

## 2. What a Real System Should Do

A real driver-monitoring system should behave like this:

### Calibration behavior
- It should **collect only clean samples**, not blindly collect and reject later.
- It should not fail because of one noisy frame.
- It should learn the driver’s **real forward baseline**, not force mathematically perfect zero yaw.
- It should allow **camera bias** if the pose is stable.
- It should give clear, actionable instructions.
- It should pause and ask for manual retry only after fair automatic attempts.

### Runtime detection behavior
- It should treat **low confidence as uncertainty**, not as danger.
- It should require **stronger multi-cue evidence** for severe states like microsleep.
- It should treat mirror checks as **normal, protected behavior**.
- It should distinguish between:
  - drowsiness
  - yawn
  - mirror glance
  - looking down
  - phone use
  - side distraction
- It should use **time-based evidence**, not frame-count-only logic.
- It should be tolerant to camera angle, lighting, and short noise spikes.

This is the difference between a demo that works only under perfect conditions and a system that behaves reasonably in real use.

---

## 3. Required Changes by File

---

## 3.1 `config.py` — Add Missing Calibration Constants and Synchronize the Project

### Problem
The current `calibration.py` imports constants that do not exist in the uploaded `config.py`.

### Required action
Add the missing constants so the current calibrator and runtime logic are working from one shared configuration.

### Add these constants

```python
# --- Calibration stage control ---
CALIBRATION_PRE_STABLE_FRAMES = 5
CALIBRATION_STAGE_TIMEOUT_SEC = 8.0
CALIBRATION_SIDE_ALIGN_SECONDS = 0.7
CALIBRATION_MAX_AUTO_RETRIES = 1

# --- Calibration quality gates ---
CALIBRATION_MIN_EYE_SPAN_PX = 18.0
CALIBRATION_GOOD_EAR_CONF_MIN = 0.65
CALIBRATION_GOOD_GAZE_CONF_MIN = 0.45
CALIBRATION_MAX_YAW_RATE = 45.0
CALIBRATION_MAX_PITCH_RATE = 35.0
CALIBRATION_SKIP_BLINK_RATIO = 0.80
CALIBRATION_SKIP_YAWN_RATIO = 1.20
CALIBRATION_FORWARD_HARD_MAX_ABS_YAW = 18.0
CALIBRATION_FORWARD_MAX_BAD_FRAMES = 18
CALIBRATION_SIDE_MAX_BAD_FRAMES = 20

# --- Side direction logic ---
LEFT_MIRROR_EXPECTED_SIGN = -1
RIGHT_MIRROR_EXPECTED_SIGN = 1
CALIBRATION_DIRECTION_MARGIN_DEG = 4.0
```

### Why
Without these constants, the calibrator and config layer are not synchronized. The project must have a single source of truth for thresholds and timing.

---

## 3.2 `face_metrics.py` — Make Head Pose Safer and Resettable

### Problems
1. `get_head_pose()` uses `solvePnP`, but it does not check `success` before using the result.
2. The smoothing state is global and is not reset during recalibration.
3. The current pose can be noisy enough to trigger false `hold still` messages.
4. The comment says “multi-landmark geometry method” but the implementation is actually `solvePnP`. The comment and code do not match.

### Required changes

#### A. Add a smoother reset function

```python
def reset_head_pose_smoothing():
    global _smooth_yaw, _smooth_pitch, _smooth_roll, _ema_init
    _smooth_yaw = 0.0
    _smooth_pitch = 0.0
    _smooth_roll = 0.0
    _ema_init = False
```

#### B. Guard `solvePnP()` properly

```python
def get_head_pose(landmarks, w, h):
    global _smooth_yaw, _smooth_pitch, _smooth_roll, _ema_init

    image_points = np.array([
        [landmarks[1].x * w, landmarks[1].y * h],
        [landmarks[152].x * w, landmarks[152].y * h],
        [landmarks[33].x * w, landmarks[33].y * h],
        [landmarks[263].x * w, landmarks[263].y * h],
        [landmarks[61].x * w, landmarks[61].y * h],
        [landmarks[291].x * w, landmarks[291].y * h],
    ], dtype=np.float64)

    camera_matrix = np.array([
        [w, 0, w / 2],
        [0, w, h / 2],
        [0, 0, 1]
    ], dtype=np.float64)
    dist_coeffs = np.zeros((4, 1))

    success, rotation_vector, translation_vector = cv2.solvePnP(
        FACE_3D_MODEL,
        image_points,
        camera_matrix,
        dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )

    if not success:
        return _smooth_yaw, _smooth_pitch, _smooth_roll

    rmat, _ = cv2.Rodrigues(rotation_vector)
    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)

    raw_pitch = float(np.clip(angles[0], -60.0, 60.0))
    raw_yaw = float(np.clip(angles[1], -75.0, 75.0))
    raw_roll = float(np.clip(angles[2], -45.0, 45.0))

    if not _ema_init:
        _smooth_yaw, _smooth_pitch, _smooth_roll = raw_yaw, raw_pitch, raw_roll
        _ema_init = True
    else:
        alpha = 0.30
        _smooth_yaw = alpha * raw_yaw + (1 - alpha) * _smooth_yaw
        _smooth_pitch = alpha * raw_pitch + (1 - alpha) * _smooth_pitch
        _smooth_roll = alpha * raw_roll + (1 - alpha) * _smooth_roll

    return _smooth_yaw, _smooth_pitch, _smooth_roll
```

### Why
A real system should not treat failed or noisy pose estimates as ground truth.

---

## 3.3 `main.py` — Fix Recalibration Flow and Pause Handling

### Problems
1. `reset_calibration()` does not reset pose smoothing.
2. `manual_retry_required` is checked, but it is not properly tied to `calibrator.pause_required`.
3. There are **two definitions** of `draw_calibration()`.
4. The calibration UI gives messages, but does not show enough live information about why frames are being skipped.

### Required changes

#### A. Import the smoother reset

```python
from face_metrics import get_dominant_ear, get_mar, get_head_pose, reset_head_pose_smoothing
```

#### B. Reset pose smoothing when calibration resets

Inside `reset_calibration()`:

```python
reset_head_pose_smoothing()
```

#### C. Mirror pause state correctly after each calibration update

After:

```python
calibrator.update(...)
```

add:

```python
manual_retry_required = calibrator.pause_required
```

#### D. Remove the duplicate `draw_calibration()`
Keep only one function.

#### E. Improve the calibration overlay
The overlay should show:
- current stage
- progress percent
- stable count / target
- bad frame count
- last skip reason
- last reject reason

Suggested extra text:

```python
cv2.putText(frame, f"Stable: {calibrator.stage_stable_count}/{CALIBRATION_PRE_STABLE_FRAMES}", ...)
cv2.putText(frame, f"Bad frames: {calibrator.stage_bad_frames}", ...)
cv2.putText(frame, f"Skip: {calibrator.last_skip_reason[:60]}", ...)
```

### Why
The user must be able to understand what the system wants. A real system does not just fail silently or loop retries without explaining what is wrong.

---

## 3.4 `calibration.py` — Redesign the Calibration Controller

This is the most important file to change.

### Problems
1. Timeout starts before the stage has really begun.
2. One bad frame destroys all stability progress.
3. Pose-rate filtering is too aggressive.
4. Side-stage retry flow is still too destructive.
5. Forward calibration still relies too much on centered yaw.
6. The architecture still mixes “waiting to stabilize” and “actively capturing.”

### New stage model
Use this sequence for every stage:

```text
WARMUP -> WAIT_STABLE -> CAPTURE_GOOD_FRAMES -> VALIDATE -> NEXT_STAGE
```

### The main design rule
Only **good frames** should count toward calibration.

### Required changes

#### A. Add a softer skip penalty function

```python
def _apply_skip_penalty(self, skip_reason):
    if skip_reason in {"eyes open please", "close mouth and avoid talking"}:
        self.stage_stable_count = max(0, self.stage_stable_count - 1)
        return

    if skip_reason == "hold still":
        self.stage_stable_count = max(0, self.stage_stable_count - 2)
        self.stage_bad_frames += 1
        return

    self.stage_stable_count = 0
    self.stage_bad_frames += 1
```

#### B. Start timeout only after stable pose has been reached

The current code starts capture timing too early. Move that logic so timeout starts only after the stage has passed the stable-frame requirement.

#### C. Replace the current `update()` flow with this pattern

```python
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
    if self.pause_required:
        return False

    if self.stage_warmup_remaining > 0:
        self.stage_warmup_remaining -= 1
        self.last_skip_reason = "warming up"
        return False

    if self.current_stage_name != "FORWARD" and self._side_align_remaining() > 0.0:
        self.stage_stable_count = 0
        self.last_skip_reason = "turn to the mirror and hold that pose"
        return False

    skip_reason, yaw_rate, pitch_rate = self._frame_skip_reason(
        ear, yaw, pitch, mar,
        left_span, right_span,
        gaze_h, gaze_v,
        ear_confidence, gaze_confidence,
    )

    if skip_reason:
        self._apply_skip_penalty(skip_reason)
        self.last_skip_reason = skip_reason

        bad_limit = (
            CALIBRATION_FORWARD_MAX_BAD_FRAMES
            if self.current_stage_name == "FORWARD"
            else CALIBRATION_SIDE_MAX_BAD_FRAMES
        )
        if self.stage_bad_frames > bad_limit:
            self._reject_current_stage(
                "too many unstable frames; keep head steady and eyes clearly visible"
            )
        return False

    self.stage_stable_count += 1
    if self.stage_stable_count < CALIBRATION_PRE_STABLE_FRAMES:
        self.last_skip_reason = "hold still to begin capture"
        return False

    if self.stage_capture_started_at is None:
        self.stage_capture_started_at = time.time()

    if (time.time() - self.stage_capture_started_at) > CALIBRATION_STAGE_TIMEOUT_SEC:
        self._reject_current_stage("capture timed out; keep the pose a little longer")
        return False

    self.last_skip_reason = ""
    self._append_current(
        ear, yaw, pitch, mar,
        left_span, right_span,
        gaze_h, gaze_v,
        gaze_confidence, ear_confidence,
    )

    if not self._stage_ready():
        return False

    stage_name = self.current_stage_name
    reject_reasons = (
        self._validate_forward_stage()
        if stage_name == "FORWARD"
        else self._validate_side_stage(stage_name)
    )
    if reject_reasons:
        self._reject_current_stage("; ".join(reject_reasons))
        return False

    self.last_reject_reason = ""

    if stage_name == "FORWARD":
        self._compute_forward_baselines()
        self.stage_index += 1
        self._reset_stage_runtime()
        return False

    if self.stage_index < len(self.STAGES) - 1:
        self.stage_index += 1
        self._reset_stage_runtime()
        return False

    if not self._finalize_side_ranges():
        return False

    self.calibrated = True
    return True
```

#### D. Make forward calibration baseline-tolerant
The current forward validation already partially allows off-center stable baselines. Keep that principle.

Do **not** require perfect zero yaw.

The rule should be:
- reject only if the forward pose is clearly turned too far
- accept a stable, slightly off-center baseline

#### E. Improve side-stage validation
For side stages:
- require correct direction sign
- require enough yaw magnitude
- allow weak gaze if yaw is strong enough
- do not fail the whole stage just because iris confidence is weak

#### F. Make mirror-range finalization less destructive
The current `_finalize_side_ranges()` clears both side stages if left and right are not distinct enough.

That is too harsh.

New rule:
- if only one side is weak, clear only that side
- keep the good side
- only force both sides again if both are invalid

### Why
A real system should not restart everything because of one unstable moment. It should salvage good work and only re-collect what is actually bad.

---

## 3.5 `drowsiness.py` — Make Severe States More Evidence-Based

### What is already good
The current module already includes:
- PERCLOS
- blink-duration tracking
- low-EAR fatigue timing
- head nod support
- microsleep suppression logic for mirror/side poses

This is good.

### What still needs improvement
#### A. Use a stronger separation between:
- noisy low EAR
- fatigue
- drowsiness
- microsleep

#### B. Severe states must require stronger evidence
A real system should not trigger `MICROSLEEP` from one weak cue.

### Required runtime rules

#### Microsleep
Require:
- eye closure long enough
- plus one of:
  - high PERCLOS
  - slow blink pattern
  - confirmed head nod
  - strong closed EAR under good confidence

#### Fatigue
Should be driven by:
- elevated PERCLOS over time
- repeated slow blinks
- short sustained low EAR

#### Drowsy
Should be a stronger version of fatigue, not just “low EAR right now.”

### Suggested architecture

```text
raw EAR -> filtered EAR -> evidence timers -> candidate fatigue state -> confirmed state
```

### Optional improvement
Introduce a shared quality score:

```python
measurement_quality = weighted combination of:
- ear_confidence
- gaze_confidence
- min eye visibility
- face size / eye span
- pose stability
```

Then follow this rule:

> If measurement quality is low, downgrade confidence or return UNKNOWN/hold previous state instead of escalating danger.

---

## 3.6 `iris_gaze.py` — Keep Mirror Logic, but Make It More Defensive

### What is already good
The current gaze tracker already has strong ideas:
- calibrated gaze baseline
- left/right mirror ranges
- yaw bands
- mirror grace timing
- eyes-only mirror logic
- phone-down gaze logic

### What should change
#### A. Low gaze confidence should mean “reduced trust,” not necessarily rejection
For calibration and runtime:
- strong yaw + weak gaze should still allow yaw-only mirror interpretation
- weak gaze alone should not become strong distraction evidence

#### B. Mirror detection should stay protected only inside reasonable timing
The current logic already has:
- `MIRROR_MIN_SECONDS`
- `MIRROR_MAX_SECONDS`
- `MIRROR_GRACE_SECONDS`

That is good and should stay.

#### C. Runtime state meaning
A real system should interpret attention like this:
- `MIRROR CHECK` = learned side-glance envelope within normal timing
- `EYES OFF ROAD` = gaze or yaw away from road without mirror protection
- `PHONE IN LAP` = downward eyes + downward pitch pattern
- `ALERT` = normal forward state

---

## 4. Whole-System Architecture Changes

The full module should move toward this pipeline:

```text
Landmarks / detections
    -> raw metrics (EAR, MAR, yaw, pitch, gaze, phone)
    -> measurement quality
    -> event evidence timers
    -> candidate labels
    -> state arbitration / smoothing
    -> final driver state
```

### Why this is better
Right now, some parts are already doing this informally, but the logic is still scattered.

A real system should explicitly separate:
1. **What was measured**
2. **How trustworthy the measurement is**
3. **What event may be happening**
4. **What final driver state to report**

This makes the system easier to debug and much more stable.

---

## 5. Specific Behavioral Rules the System Should Follow

### 5.1 Forward calibration
- Accept a stable forward pose even if camera placement is slightly off-center.
- Reject only large sideways bias or unstable motion.

### 5.2 Mirror calibration
- Require direction consistency.
- Allow yaw-only fallback when gaze is weak.
- Preserve the good side if only one side was bad.

### 5.3 Drowsiness
- Use low EAR only as one cue.
- Combine with PERCLOS, slow blink, or nod evidence.

### 5.4 Microsleep
- Require sustained closure and support evidence.
- Be conservative under low confidence or mirror-like poses.

### 5.5 Yawn
- Require sustained MAR and not just one mouth-opening frame.
- Avoid confusing talking with yawning.

### 5.6 Distraction
- Use yaw duration, gaze direction, and mirror protection together.
- Do not mark normal mirror checks as distraction.

### 5.7 Looking down / phone in lap
- Use pitch + gaze-down + timing.
- Avoid confusing brief instrument-panel glances with phone use.

---

## 6. Recommended State Priority

When more than one condition is true, a real system should prioritize like this:

```text
PHONE USE
MICROSLEEP
DROWSY
FATIGUED
YAWNING
DISTRACTED
LOOKING DOWN
MIRROR CHECK / ALERT
```

### Why
- `PHONE USE` and `MICROSLEEP` are the most dangerous.
- `DROWSY` is more serious than `YAWNING`.
- `MIRROR CHECK` should protect normal driving behavior.

---

## 7. Recommended Implementation Order

Do the work in this order.

### Phase 1 — Fix calibration reliability first
1. Synchronize `config.py` with `calibration.py`
2. Add `reset_head_pose_smoothing()` in `face_metrics.py`
3. Reset the smoother in `main.py`
4. Fix `manual_retry_required = calibrator.pause_required`
5. Remove duplicate `draw_calibration()`
6. Redesign `calibration.py update()` so timeout starts after stable capture begins
7. Add `_apply_skip_penalty()`
8. Relax pose-rate thresholds to realistic values

### Phase 2 — Improve mirror and attention logic
1. Keep yaw-only fallback for weak gaze
2. Preserve valid side calibration when only one side is weak
3. Improve overlay/debug info for mirror and distraction states

### Phase 3 — Improve drowsiness and microsleep logic
1. Add shared measurement-quality concept
2. Tighten microsleep evidence fusion
3. Normalize runtime EAR by visibility / current view if needed

### Phase 4 — Tune with logs
1. Save runtime metrics to CSV
2. Replay sessions offline
3. Tune thresholds using real examples instead of guessing

---

## 8. Acceptance Tests

After changes are implemented, these tests should pass.

### Calibration tests
- Looking forward steadily should complete without repeated retries.
- One blink during calibration should not force a full stage reset.
- Slightly off-center camera should still allow forward calibration.
- Turning left should calibrate only left mirror, not both sides.
- Turning right should calibrate only right mirror, not both sides.
- Recalibration should start cleanly with no carry-over from prior pose.

### Runtime tests
- Normal mirror glance should not become `DISTRACTED`.
- Quick dashboard glance should not become `PHONE USE`.
- Strong sustained downward look should become `LOOKING DOWN` or `PHONE IN LAP`.
- Slow repeated blinks + high PERCLOS should move toward `FATIGUED` or `DROWSY`.
- Sustained eye closure with support evidence should become `MICROSLEEP`.
- Weak/uncertain gaze should not trigger strong false distraction alerts.

---

## 9. Final Recommendation

The system does **not** need a full rewrite, but it **does** need a structural calibration redesign and a more explicit confidence/evidence model.

### The minimum critical fixes are:
1. Synchronize config and calibrator constants
2. Start calibration timeout only after stable capture begins
3. Stop fully resetting stability on every noisy frame
4. Reset pose smoothing during recalibration
5. Mirror `pause_required` correctly in `main.py`
6. Keep forward calibration tolerant to stable camera bias

### The medium-priority improvements are:
1. Better mirror-side handling
2. Shared measurement-quality score
3. Stronger evidence fusion for microsleep and drowsiness
4. More transparent UI/debug output

If these changes are made, calibration will become much more reliable and the whole system will behave more like a real driver-monitoring pipeline instead of a fragile threshold demo.
