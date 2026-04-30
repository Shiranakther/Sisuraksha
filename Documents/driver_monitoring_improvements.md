# Sisuraksha — Driver Monitoring System: Laptop Optimization Plan
**Author:** IT22610102 | Pinto R.I.S.R | 25-26J-282  
**Date:** April 2026  
**Branch transition:** `Hardware-Constrained Heuristics` → `Robust Edge AI`

---

> [!IMPORTANT]
> **Implementation strategy:** Do NOT implement everything at once. Work tier-by-tier, one item at a time.  
> After each item: run the system for 2–3 minutes, observe logs, confirm no regressions, then tick the checkbox.

---

> [!NOTE]
> **April 23, 2026 implementation update:** The live system now uses calibrated gaze baselines, mirror-check timing gates, EAR confidence, and corroborated microsleep logic to reduce false positives during side-mirror checks. Where this document still describes the older single-signal heuristic, follow the runtime implementation instead.

> [!NOTE]
> **Later April 23, 2026 update:** Calibration is now moving toward a guided multi-pose flow (`forward`, `left mirror`, `right mirror`) so mirror bands and a true `>45°` distraction threshold can be learned per camera position. Iris handling has also been upgraded from a single center-point heuristic to a confidence-weighted iris contour estimate.

## Context: Why This Transition?

The original system was designed around a Raspberry Pi 4 with strict constraints:
- Limited CPU cycles → frame skipping, low YOLO resolution, short calibration windows
- Variable FPS (8–15) → frame-count-based windows produce inconsistent time behaviour
- No spare memory → 6-point EAR, single-pass smoothing, no signal pre-filtering

On a **laptop** (Intel i5/i7, 30+ FPS, 8–16 GB RAM), all of these trade-offs are unnecessary.  
The goal is now **maximising detection precision and academic rigour**, not saving cycles.

**Primary Performance Metric for Research Paper:** `Time-to-Alarm (TTA)` in milliseconds — the elapsed time from the onset of a fatigue/distraction event to the first alert trigger.

---

## Current System Snapshot (Baseline)

| Parameter | Current Value | Location |
|---|---|---|
| `LOW_SPEC_MODE` | `True` | `config.py:8` |
| `CALIBRATION_FRAMES` | `30` | `config.py:32` |
| `PHONE_INPUT_SIZE` | `224` (LOW_SPEC) / `320` | `config.py:111` |
| `PHONE_CONF_THRESHOLD` | `0.25` | `config.py:109` |
| `PHONE_PERSIST_FRAMES` | `20` | `config.py:113` |
| `IRIS_ENABLED` | `False` | `config.py:75` |
| `PERCLOS_WINDOW` | `75` frames (LOW_SPEC) | `config.py:45` |
| `SMOOTH_BUFFER_SIZE` | `5` (uniform, all states) | `config.py:69` |
| Head pose method | 2D landmark geometry | `face_metrics.py:42–93` |
| EAR landmark count | 6 points per eye | `config.py:78–79` |
| EAR smoothing | Single EMA (α=0.45) | `drowsiness.py:37–43` |
| Phone confirmation | Single positive hit = alert | `phone_detector.py:115–128` |

---

## Tier 1 — High-Impact Configuration ("Quick Wins")

> [!NOTE]
> All Tier 1 changes are **config.py only**. No algorithmic changes. Estimated time: 30 minutes total.

---

### T1-A: Disable Low-Spec Mode

- **File:** `config.py`, line 8
- **Current:** `LOW_SPEC_MODE = True`
- **Proposed:** `LOW_SPEC_MODE = False`
- **Effect:** Cascades to `FRAME_WIDTH` (480→640), `FRAME_HEIGHT` (360→480), `DEBUG_PRINT_EVERY` (0→15), `PHONE_INPUT_SIZE` (224→320), `PHONE_SKIP_FRAMES` (4→2), `PERCLOS_WINDOW` (75→150).
- **Risk:** None. The laptop easily handles 640×480 at 30 FPS.

- [ ] Implemented
- [ ] System runs stable at 30 FPS with no dropped frames
- [ ] Overlay renders correctly at new resolution

---

### T1-B: Enable Iris Gaze Tracking

- **File:** `config.py`, line 75
- **Current:** `IRIS_ENABLED = False`
- **Proposed:** `IRIS_ENABLED = True`
- **Effect:** Activates the iris sub-pixel landmark pipeline in `iris_gaze.py`. The `state_machine.py` MIRROR CHECK branch (line 76–78) becomes live. Head turns accompanied by iris-on-road gaze are correctly classified as `MIRROR CHECK` instead of `DISTRACTED`.
- **Why it matters:** The most impactful single change for reducing false DISTRACTED alerts on mirror checks.
- **Dependency:** Verify `iris_gaze.py` returns `"MIRROR CHECK"` correctly before enabling. Run `debug_landmarks.py` first.

- **Status note:** The simple center-ratio-only iris rule was not enough. The current implementation uses calibration-aware gaze deltas plus a `0.25s` to `1.2s` mirror-check window and avoids escalating brief side turns to `DISTRACTED` unless off-road evidence persists.

- [x] Tested iris_gaze.py in isolation (debug_landmarks.py)
- [x] Implemented `IRIS_ENABLED = True`
- [ ] Mirror check correctly suppresses DISTRACTED state
- [ ] No iris-related exceptions in error.log

---

### T1-C: Extend Calibration Window

- **File:** `config.py`, line 32
- **Current:** `CALIBRATION_FRAMES = 30` (~2 sec at 15 FPS)
- **Proposed:** `CALIBRATION_FRAMES = 90` (~3 sec at 30 FPS, effectively ~6 sec of real-time data)
- **Effect:** Wider statistical sample → more stable `baseline_ear`, `baseline_mar`, and head pose offsets. Reduces threshold drift for drivers who sit at non-standard distances.
- **Risk:** Longer startup delay (negligible on laptop).

- [x] Implemented
- [ ] Calibration completes without crashing
- [ ] Baseline EAR value looks reasonable (log check: should be 0.25–0.35 range)
- [ ] No regression in drowsiness detection sensitivity post-calibration

---

### T1-D: Raise YOLO Input Resolution

- **File:** `config.py`, line 111
- **Current:** `PHONE_INPUT_SIZE = 224 if LOW_SPEC_MODE else 320`
- **Proposed:** `PHONE_INPUT_SIZE = 416` (after T1-A sets `LOW_SPEC_MODE = False`)
- **Effect:** YOLO sees a finer image; detects phones held further away or at steeper angles. Was limited to 224px on Pi due to inference time.
- **Note:** After T1-A, the else-branch resolves to 320. This change explicitly overrides to 416.
- **Benchmark:** Time the inference thread (`inference_ms` in logs) — should stay under 80ms on a modern laptop GPU/CPU.

- [ ] Implemented
- [ ] `inference_ms` logged under 80ms consistently
- [ ] Phone detection still triggers correctly at arms-length distance
- [ ] No memory or thread errors

---

### T1-E: Stricter Confidence + Shorter Persistence

- **File:** `config.py`, lines 109 and 113
- **Current:** `PHONE_CONF_THRESHOLD = 0.25`, `PHONE_PERSIST_FRAMES = 20`
- **Proposed:** `PHONE_CONF_THRESHOLD = 0.40`, `PHONE_PERSIST_FRAMES = 12`
- **Rationale:** Higher threshold rejects reflections, shadows, wallets. Shorter persistence keeps the alert responsive without ghost detections lingering for a full second.
- **Risk:** May miss very fast phone glimpses. Mitigated by T3-E (Object Confirmation Voting).

- [x] Implemented
- [x] Phone detection triggers correctly on genuine phone use
- [x] No false positives from hands/shadows in 2-minute test
- [x] Alert clears promptly after phone is lowered

---

## Tier 2 — Structural Algorithm Upgrades ("Research Value")

> [!NOTE]
> Tier 2 involves modifying `face_metrics.py` and `drowsiness.py`. Each item is independent — implement one, test fully, then move to the next.

---

### T2-A: 3D Head Pose via `cv2.solvePnP`

- **File:** `face_metrics.py` — replace `get_head_pose()` function (lines 42–93)
- **Current method:** 2D normalised ratio geometry (nose offset, eye axis slope). Returns ±1 normalised values.
- **Proposed method:** `cv2.solvePnP` maps 6 key landmarks to a known 3D face model, producing true **Yaw, Pitch, Roll in degrees**.

**6 Landmark points to use:**

| Landmark | MediaPipe Index | Role |
|---|---|---|
| Nose tip | 1 | Anchor |
| Chin | 152 | Vertical extent |
| Left eye outer | 33 | Horizontal extent |
| Right eye outer | 263 | Horizontal extent |
| Left mouth corner | 61 | Lower face |
| Right mouth corner | 291 | Lower face |

**3D reference model (in mm, face-centred origin):**
```python
FACE_3D_MODEL = np.array([
    [0.0,    0.0,    0.0],    # Nose tip
    [0.0,   -63.6, -12.5],   # Chin
    [-43.3,  32.7, -26.0],   # Left eye outer
    [43.3,   32.7, -26.0],   # Right eye outer
    [-28.9, -28.9, -24.1],   # Left mouth corner
    [28.9,  -28.9, -24.1],   # Right mouth corner
], dtype=np.float64)
```

**Why this is better:**
- Produces real angles (degrees) instead of normalised ratios — directly reportable in your paper.
- Eliminates threshold drift when the driver leans closer/further from camera (scale-invariant).
- Enables future comparison with published drowsiness datasets that report head pose in degrees.

**Implementation steps:**
1. Add `FACE_3D_MODEL` and camera matrix estimation to `face_metrics.py`.
2. Keep `get_head_pose()` as the public API signature — return `(yaw_deg, pitch_deg, roll_deg)`.
3. Update `config.py` thresholds: convert current ratio-based thresholds to degree equivalents.
   - `YAW_THRESHOLD = 0.45` ratio ≈ `25–30°` yaw
   - `PITCH_DOWN_THRESHOLD = 0.35` ≈ `15–20°` pitch down
4. Update `main.py` overlay to display degrees symbol (°).

> [!WARNING]
> After implementing T2-A, you **must** recalibrate threshold values in `config.py`. The old ratio-based numbers will not apply to degree outputs. Run the system and observe head-pose readings for 5 minutes to determine new thresholds empirically.

- [x] `solvePnP` implementation in face_metrics.py
- [x] Camera matrix estimated from frame dimensions (fallback: `fx = fy = frame_width`)
- [x] Returns degrees (floats, not ratios)
- [x] config.py thresholds updated to degree values
- [x] main.py overlay shows "Yaw: X°" format
- [x] Calibration subtracts solvePnP baseline (forward = 0°, 0°, 0°)
- [x] DISTRACTED triggers at ~25–30° yaw
- [x] LOOKING DOWN triggers at ~15–20° pitch

---

### T2-B: Dominant Eye Selection

- **File:** `face_metrics.py` — modify `get_dominant_ear()` function (lines 109–125)
- **Current:** At `abs(yaw) > 0.35`, uses 75/25 near/far weighting.
- **Proposed:** Compute a **visibility score** for each eye and select the eye with the higher score as dominant. The visibility score is the ratio of the eye's horizontal span to the maximum expected span (derived during calibration).

**Visibility score formula:**
```
visibility(eye) = horizontal_span(eye) / calibrated_max_span(eye)
```
- If `visibility_left > visibility_right + margin`: use left eye EAR with 85% weight.
- If `visibility_right > visibility_left + margin`: use right eye EAR with 85% weight.
- Otherwise: average both.

**Why it's better than the current fixed 0.35 threshold:**
- Works at any yaw angle, not just "past 0.35".
- Adapts to A-pillar camera mounts where one eye is consistently more occluded.
- Reduces false drowsiness alerts from geometric eye compression.

**Additional change:** Store `calibrated_eye_span` values during the calibration phase in `calibration.py` and pass them to `get_dominant_ear()`.

- [x] Visibility score calculated per frame
- [x] Dominant eye selection replaces fixed-yaw heuristic
- [x] Calibration stores max eye spans
- [x] Tested: looking left/right no longer triggers false MICROSLEEP
- [x] Tested: genuine eye closure with turned head still triggers MICROSLEEP

---

### T2-C: Expanded EAR Landmark Set (10-point Contour)

- **File:** `config.py` (landmark indices), `face_metrics.py` (EAR formula)
- **Current:** 6 points per eye (`LEFT_EYE`, `RIGHT_EYE` — standard formula).
- **Proposed:** Use **10 landmark points** per eye from MediaPipe's full eye contour, averaging 4 vertical pairs instead of 2.

**Extended left eye indices (10 points):**
```python
LEFT_EYE_10  = [362, 398, 384, 385, 386, 387, 388, 466, 373, 380]
RIGHT_EYE_10 = [33,  246, 161, 160, 159, 158, 157, 173, 153, 144]
```

**New EAR formula (4 vertical pairs):**
```
EAR = (|v1| + |v2| + |v3| + |v4|) / (4 × |h|)
```
Where v1–v4 are 4 evenly-spaced vertical pairs across the eye width, and h is the horizontal span.

**Why this is better:**
- Averaging 4 pairs instead of 2 reduces noise from a single misplaced landmark (common with glasses).
- Produces a smoother, more robust EAR signal without additional filtering overhead.

> [!NOTE]
> Keep the original `LEFT_EYE` / `RIGHT_EYE` 6-point indices in config.py as fallback. Add new constants `LEFT_EYE_10` / `RIGHT_EYE_10`. Add a `config.py` flag `EAR_EXTENDED = True` to switch between them.

- [x] New landmark indices added to config.py
- [x] `EAR_EXTENDED` flag added
- [x] `get_ear()` updated to handle 10-point formula when flag is True
- [x] EAR values compared side-by-side (debug print) — 10-point should be smoother
- [x] No index-out-of-range errors
- [x] Drowsiness thresholds re-verified (baseline EAR may shift slightly)

---

## Tier 3 — Signal Processing & Robustness ("Stability")

> [!NOTE]
> Tier 3 items are mostly additive (new functions/classes). They do not replace existing logic — they wrap it. Each is independently testable.

---

### T3-A: Median Pre-Filter for EAR Signal

- **File:** `drowsiness.py` — modify `filter_ear()` method (lines 37–43)
- **Current:** Single EMA (α=0.45) applied directly to raw EAR.
- **Proposed:** Insert a 3-frame median filter **before** the EMA:
  ```
  raw_ear → median(last 3 frames) → EMA → smoothed_ear
  ```
- **Implementation:** Add a `collections.deque(maxlen=3)` buffer `_median_buffer`. Each call to `filter_ear()` appends the raw value, computes the median, then feeds it to the existing EMA.
- **Why:** A single corrupted frame (motion blur, glasses glare) currently spikes EAR by 0.05–0.10, which can prematurely trigger or suppress a blink event. The median filter eliminates single-frame outliers before they reach PERCLOS or blink history.

- [x] `_median_buffer` deque added to `__init__`
- [x] Median step added before EMA in `filter_ear()`
- [x] Debug print confirms median flattens spike frames
- [x] PERCLOS values more stable in 2-minute test
- [x] Blink durations less erratic

---

### T3-B: Time-Based PERCLOS Window

- **File:** `drowsiness.py` — modify `update_ear_history()` and `get_perclos()` (lines 46–58)
- **Current:** `deque(maxlen=PERCLOS_WINDOW)` — 75 or 150 frames. At 30 FPS, 150 frames = 5 seconds. At 15 FPS, 150 frames = 10 seconds. **The window is frame-rate-dependent.**
- **Proposed:** Replace the frame-count deque with a **timestamped deque** and a configurable time window (default: 5.0 seconds).

**New config constant:**
```python
PERCLOS_WINDOW_SEC = 5.0   # seconds (replaces PERCLOS_WINDOW frame count)
```

**New data structure:** `deque` stores `(timestamp, ear_value)` tuples. `get_perclos()` filters entries older than `PERCLOS_WINDOW_SEC` before computing the ratio.

**Why it matters for research:** A "5-second PERCLOS window" is a standardised metric from the literature (Wierwille & Ellsworth, 1994). Reporting "PERCLOS over 5 seconds" is directly comparable to published studies. Frame-count windows are not reproducible across hardware.

- [x] `PERCLOS_WINDOW_SEC = 5.0` added to config.py
- [x] `ear_history` changed to store `(time.time(), ear)` tuples
- [x] `get_perclos()` filters by time, not count
- [x] PERCLOS values cross-validated: at 30 FPS and 15 FPS (artificial throttle), same eye closure produces same PERCLOS %
- [x] Research paper note: document as "5-second PERCLOS window per Wierwille & Ellsworth (1994)"

---

### T3-C: Frame Quality Gating

- **File:** `main.py` — add quality gate before landmark processing
- **Current:** Every frame is processed regardless of image quality.
- **Proposed:** Before passing the frame to MediaPipe, compute two quality metrics:

**1. Blur gate (Laplacian variance):**
```python
gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()
if blur_score < BLUR_THRESHOLD:
    # skip landmark processing, use last known state
```
Config constant: `BLUR_THRESHOLD = 50.0` (tune empirically; vehicles produce ~30–80 blur variance).

**2. Landmark jump gate:**
```python
if prev_nose_pos is not None:
    jump = np.linalg.norm(curr_nose - prev_nose)
    if jump > LANDMARK_JUMP_THRESHOLD:
        # discard this frame
```
Config constant: `LANDMARK_JUMP_THRESHOLD = 40.0` pixels (for 640×480 frame).

**Behaviour on gate failure:** Do NOT update PERCLOS, EAR history, or blink timer. Carry forward the last valid reading. Display `[NOISY FRAME]` in debug overlay.

- [ ] `BLUR_THRESHOLD` and `LANDMARK_JUMP_THRESHOLD` added to config.py
- [ ] Quality gate implemented at top of main processing loop
- [ ] Gated frames logged/counted (overlay: `QGate: X/100`)
- [ ] Test: covering camera briefly does not spike PERCLOS
- [ ] Test: quick head shake does not trigger MICROSLEEP

---

### T3-D: State-Specific Smoothing Weights

- **File:** `state_machine.py` — modify `get_smoothed_state()` (lines 111–114)
- **Current:** Simple mode-filter over last `SMOOTH_BUFFER_SIZE=5` frames (uniform for all states).
- **Proposed:** Replace with a **state-specific confirmation window**:

| State | Required Consecutive Frames | Rationale |
|---|---|---|
| `MICROSLEEP` | 2 | High urgency; fast response |
| `PHONE USE` | 3 | High urgency but avoid ghost detections |
| `DISTRACTED` | 4 | Allow brief mirror checks |
| `DROWSY` | 8 | Long-term trend; reduce alert fatigue |
| `FATIGUED` | 10 | Slow-building signal; needs confirmation |
| `YAWNING` | 3 | Short event; already has MAR sustain gate |
| `LOOKING DOWN` | 4 | Allow brief downward glances |
| `ALERT` | 2 | Reset quickly once danger clears |

**Implementation:** In `get_smoothed_state()`, look up the required frame count for the candidate state, only commit if the state has been continuously present for that many frames.

- [x] State-specific window dict added to `StateMachine`
- [x] `get_smoothed_state()` uses per-state windows
- [x] MICROSLEEP triggers within ~2 frames of eye closure ✓
- [x] FATIGUED requires ~10 frames of sustained signal ✓
- [x] ALERT resets promptly when all signals clear ✓
- [x] No "alert flickering" observed in 5-minute test

---

### T3-E: Object Confirmation Voting for Phone Detection

- **File:** `phone_detector.py` — modify `detect()` method (lines 137–176)
- **Current:** A single positive YOLO inference immediately sets `phone_detected=True`, which persists for `PHONE_PERSIST_FRAMES`.
- **Proposed:** Require **2 positive hits within a rolling 10-frame window** before reporting `phone_detected=True`.

**New data structure:** `_vote_window = collections.deque(maxlen=10)` stores `True/False` per frame.  
**Trigger condition:** `sum(_vote_window) >= PHONE_VOTE_THRESHOLD` (where `PHONE_VOTE_THRESHOLD = 2`).

**New config constants:**
```python
PHONE_VOTE_WINDOW   = 10   # rolling window size
PHONE_VOTE_THRESHOLD = 2   # minimum positive hits to confirm
```

**Why:** Single-frame detections from shadows, wallets, or reflections cannot produce 2 hits in 10 frames. Genuine phone use will produce 3–5 hits per 10 frames at typical confidence.

- [ ] `PHONE_VOTE_WINDOW` and `PHONE_VOTE_THRESHOLD` added to config.py
- [ ] `_vote_window` deque added to `PhoneDetector.__init__`
- [ ] `detect()` appends True/False to vote window each call
- [ ] Phone alert only fires when `sum(_vote_window) >= PHONE_VOTE_THRESHOLD`
- [ ] Test: holding wallet briefly does NOT trigger PHONE USE
- [ ] Test: holding phone for 1+ second DOES trigger PHONE USE

---

## Implementation Order & Testing Protocol

```
T1-A (Low Spec Off)
    └─ T1-B (Iris Enable)
    └─ T1-C (Calibration Frames)
    └─ T1-D (YOLO Resolution)
    └─ T1-E (Confidence + Persistence)
         └─ T2-A (solvePnP Head Pose)      ← recalibrate thresholds after
              └─ T2-B (Dominant Eye)
              └─ T2-C (10-point EAR)
                   └─ T3-A (Median Filter)
                   └─ T3-B (Time PERCLOS)
                   └─ T3-C (Frame Gating)
                   └─ T3-D (State Weights)
                   └─ T3-E (Vote Confirm)
```

**After each item, run this checklist:**
1. `python main.py` — starts without exceptions
2. `error.log` — no new errors
3. Calibration completes and prints baseline values
4. Deliberately trigger each state (close eyes, look away, hold phone) — confirm correct label
5. 5-minute idle test — no spurious alerts

---

## Research Paper Notes

### Framing the Transition
> *"The initial system was designed under strict hardware constraints for deployment on a Raspberry Pi 4B. This iteration transitions to a laptop-grade platform, enabling a methodological shift from lightweight heuristics to industry-standard signal processing and 3D geometric modelling."*

### Key Claims After All Tiers Complete

| Metric | Before | After |
|---|---|---|
| Head pose method | 2D normalised ratio | 3D solvePnP (degrees) |
| PERCLOS window | Frame-count (FPS-dependent) | Time-based 5s (FPS-invariant) |
| EAR landmark count | 6 points | 10 points |
| EAR smoothing | EMA only | Median pre-filter + EMA |
| Phone confirmation | 1 hit = alert | 2 hits / 10 frames = alert |
| Mirror check handling | Head turn = DISTRACTED | Iris-gated MIRROR CHECK |
| State smoothing | Uniform 5-frame mode | State-specific 2–10 frames |
| Frame quality | No gating | Blur + landmark-jump gate |
| Microsleep fusion | Low EAR alone can dominate | Low EAR + support signal, with side-turn suppression |

## False-Positive Reduction Update

The main false-positive issue reported in live testing was:
- normal side-mirror checks sometimes being misclassified as `DISTRACTED`
- side turns occasionally compressing eye geometry enough to trigger `MICROSLEEP`
- side-turn mouth deformation sometimes being read as `YAWNING`

The implemented rule update is now:
- `MIRROR CHECK` uses calibrated gaze relative to head-turn direction, not raw gaze centering alone
- brief side turns can remain `ALERT` until the mirror-check timer becomes valid
- `DISTRACTED` now requires sustained off-road evidence instead of a single side-turn frame
- `YAWNING` now requires sustained high MAR in a low-yaw context
- `MICROSLEEP` now requires low EAR plus corroborating evidence such as slow blink history, raised PERCLOS, or a downward head nod
- during side turns, low-confidence EAR alone is not allowed to accumulate into `MICROSLEEP` unless the eyes stay strongly closed

### Time-to-Alarm (TTA) Measurement
Measure TTA as: `t_alert - t_event_onset` in milliseconds.
- For microsleep: onset = frame where EAR first drops below closed threshold.
- For phone: onset = frame of first YOLO positive.
- For distraction: onset = frame where yaw first exceeds threshold.

Record TTA across 20 trials per state. Report mean ± std deviation.

### References to Cite
- Wierwille & Ellsworth (1994) — PERCLOS definition (5-second window)
- Soukupová & Čech (2016) — EAR formula
- Kazemi & Sullivan (2014) — Face landmark detection
- Redmon et al. (2016) — YOLO object detection family
- OpenCV `solvePnP` documentation — 3D pose estimation

---

*Last updated: April 2026 | Sisuraksha Driver Monitoring System*
