# Sisuraksha — Driver Monitoring System
## Comprehensive Technical Document

*Author: Pinto R.I.S.R — IT22610102 | 25-26J-282*

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & File Map](#2-architecture--file-map)
3. [Startup & Initialization](#3-startup--initialization)
4. [Calibration Pipeline](#4-calibration-pipeline)
5. [Face Detection & Landmark Extraction](#5-face-detection--landmark-extraction)
6. [Head Pose Estimation](#6-head-pose-estimation)
7. [Eye Aspect Ratio (EAR)](#7-eye-aspect-ratio-ear)
8. [Mouth Aspect Ratio (MAR)](#8-mouth-aspect-ratio-mar)
9. [Drowsiness Detection](#9-drowsiness-detection)
   - 9.1 [PERCLOS](#91-perclos)
   - 9.2 [Slow Blink Detection](#92-slow-blink-detection)
   - 9.3 [Microsleep Timer](#93-microsleep-timer)
   - 9.4 [Low-EAR Fatigue Hold](#94-low-ear-fatigue-hold)
   - 9.5 [Gradual Head-Nod Detection](#95-gradual-head-nod-detection)
10. [Phone Detection (YOLOv8)](#10-phone-detection-yolov8)
11. [Iris & Gaze Tracking](#11-iris--gaze-tracking)
12. [State Machine & Priority Logic](#12-state-machine--priority-logic)
13. [Alert & Server Integration](#13-alert--server-integration)
14. [Signal Smoothing Summary](#14-signal-smoothing-summary)
15. [Full Frame Processing Loop](#15-full-frame-processing-loop)
16. [Key Tunable Constants Reference](#16-key-tunable-constants-reference)

---

## 1. System Overview

Sisuraksha Driver Monitoring is a **real-time, camera-based driver safety system** that continuously analyses the driver's face and behaviour to detect:

| Condition | Detection Method |
|---|---|
| Drowsiness / Eye closure | EAR + PERCLOS |
| Microsleep | Wall-clock eye-closure timer |
| Slow blinking | Blink duration tracking |
| Fatigue (early warning) | Low-EAR hold + slow blink fusion |
| Yawning | MAR threshold |
| Head-down (looking at lap) | Pitch angle |
| Distraction (looking away) | Yaw angle |
| Phone use | YOLOv8n object detection |
| Gradual head droop | Pitch drift over time window |

All signals are **fused** in a priority-based state machine that emits a single high-level driver state every frame. Alerts are forwarded to a backend server and displayed on a live video overlay.

---

## 2. Architecture & File Map

```
driver_monitoring/
├── main.py              ← Main loop — orchestrates all modules
├── config.py            ← All tunable constants
├── calibration.py       ← Angle-adaptive auto-calibrator
├── face_metrics.py      ← EAR, MAR, head pose (geometry method)
├── drowsiness.py        ← PERCLOS, blink, microsleep, head nod
├── state_machine.py     ← Priority state logic + temporal smoothing
├── phone_detector.py    ← YOLOv8n phone detector (background thread)
├── iris_gaze.py         ← Iris gaze tracking (stub, ready to enable)
└── best.pt              ← YOLOv8n model weights (phone class)
```

### Data Flow Between Modules

```
main.py
  │
  ├─→ face_metrics.py    EAR, MAR, Head Pose
  │         ↓
  ├─→ calibration.py     Baseline + Thresholds (run once at startup)
  │         ↓
  ├─→ drowsiness.py      PERCLOS, Blink, Microsleep, Head Nod
  │         ↓
  ├─→ iris_gaze.py       Gaze / Attention (stub)
  │         ↓
  ├─→ phone_detector.py  YOLOv8 (background thread)
  │         ↓
  └─→ state_machine.py   Final driver state → alerts + display
```

---

## 3. Startup & Initialization

### 3.1 Hardware & Model Loading

```
1. Load shared network config (server URL, driver ID)
2. Open webcam via cv2.VideoCapture with CAP_DSHOW backend (Windows)
3. Set frame resolution (480×360 low-spec, 640×480 normal)
4. Initialise MediaPipe FaceMesh (468/478 landmarks)
5. Instantiate: Calibrator, DrowsinessDetector, StateMachine, PhoneDetector
6. Start heartbeat daemon thread → POSTs /heartbeat every 5 seconds
7. Start alert sender daemon thread → drains alert queue asynchronously
8. Start stdin command listener thread → receives "recalibrate" from app
```

### 3.2 Camera Opening

On Windows, `cv2.CAP_DSHOW` (DirectShow) is tried first — it opens faster and avoids long blocking calls seen with the default backend:

```python
cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)
if not cap.isOpened():
    cap.release()
    cap = cv2.VideoCapture(CAMERA_INDEX)   # fallback
```

### 3.3 Calibration State

The system starts in an **IDLE** calibration state. Detection does not begin until the driver triggers calibration via the app or presses `r`. The UI shows:

> *"Calibration idle — tap Recalibrate Camera in the app to begin."*

---

## 4. Calibration Pipeline

The calibration module (`calibration.py`) implements an **angle-adaptive auto-calibrator**. It collects `CALIBRATION_FRAMES = 30` frames of data and automatically adjusts all detection thresholds based on both the individual driver's face geometry and the camera's mounting angle.

This solves three real-world problems in a single step:
- **Glasses** change the apparent EAR.
- **Eye shape** varies enormously between individuals.
- **Camera angle** (dashboard vs. laptop vs. A-pillar) compresses the eye geometry differently.

---

### 4.1 Data Collection

For each of the 30 calibration frames, the following readings are recorded:

| Signal | Description |
|---|---|
| **EAR** | Eye Aspect Ratio (dominant eye, averaged both eyes) |
| **Yaw** | Head left/right angle (geometric method, ±1 scale) |
| **Pitch** | Head up/down angle (geometric method, ±1 scale) |
| **MAR** | Mouth Aspect Ratio |

The driver is instructed to: *"Look forward. Keep your head still, eyes open, mouth closed."*

---

### 4.2 Validation Gate

Before accepting the collected data, the system checks for quality. **Any one failure → calibration is rejected and restarted:**

```python
ear_std         = std(ear_samples)
yaw_std         = std(yaw_samples)
blink_like_ratio = mean(ear_array < (ear_median × 0.82))  # frames that look like blinks
yawn_like_ratio  = mean(mar_array > (mar_median × 1.30))  # frames that look like yawns
```

| Check | Reject Condition | Reason |
|---|---|---|
| EAR stability | `ear_std > 0.04` | Head movement or blinking |
| Yaw stability | `yaw_std > 0.10` | Driver not looking forward |
| Blink contamination | `blink_like_ratio > 0.16` | Too many blinks in the window |
| Yawn contamination | `yawn_like_ratio > 0.10` | Mouth was open during calibration |

On rejection, all buffers are cleared and collection restarts. The app auto-retries once; if rejected again, a manual retry is required from the UI.

---

### 4.3 Baseline Computation

If the validation gate passes, the baseline is computed from the **cleanest samples** — excluding outlier frames caused by blinks or partial yawns:

```python
# EAR: use only the upper 65th percentile (frames with eyes most open)
ear_keep_floor   = percentile(ear_array, 35)
ear_open_samples = ear_array[ear_array >= ear_keep_floor]
baseline_ear     = mean(ear_open_samples)

# MAR: use only the lower 60th percentile (frames with mouth most closed)
mar_keep_ceil        = percentile(mar_array, 60)
mar_neutral_samples  = mar_array[mar_array <= mar_keep_ceil]
baseline_mar         = mean(mar_neutral_samples)

# Pose: use median for robustness against outliers
baseline_yaw   = median(yaw_array)
baseline_pitch = median(pitch_array)
```

---

### 4.4 Angle Factor Calculation

After computing the baseline pose, the system calculates how angled the camera is from dead-centre. This produces a single `angle_factor` value from `0.0` (head-on) to `1.0` (extreme side angle):

```
yaw_norm   = min(|baseline_yaw|   / 0.55, 1.0)
pitch_norm = min(|baseline_pitch| / 1.35, 1.0)

angle_factor = min(0.75 × yaw_norm + 0.25 × pitch_norm, 1.0)
```

The **0.75 weighting on yaw** reflects that yaw distorts the eye ellipse geometry far more than pitch for this landmark-based method.

| angle_factor | Camera position | Label |
|---|---|---|
| 0.0 – 0.29 | Directly in front of driver | HEAD-ON |
| 0.30 – 0.59 | Slightly to the side | MODERATE |
| 0.60 – 1.00 | Dashboard or A-pillar mount | EXTREME |

---

### 4.5 Threshold Interpolation

All detection thresholds are linearly interpolated between a "tight" head-on value and a "generous" extreme-angle value using the angle factor:

```
lerp(head_on, extreme, factor) = head_on + (extreme − head_on) × factor
```

| Ratio | Head-On | Extreme | Multiplied by |
|---|---|---|---|
| `CLOSED_RATIO` | 0.84 | 0.80 | `baseline_ear` |
| `BLINK_RATIO` | 0.88 | 0.84 | `baseline_ear` |
| `FATIGUE_RATIO` | 0.92 | 0.89 | `baseline_ear` |
| `YAWN_RATIO` | 1.35 | 1.20 | `baseline_mar` |

**Final computed thresholds:**

```
ear_closed_threshold  = baseline_ear × lerp(0.84, 0.80, angle_factor)
blink_threshold       = baseline_ear × lerp(0.88, 0.84, angle_factor)
ear_fatigue_threshold = baseline_ear × lerp(0.92, 0.89, angle_factor)
mar_yawn_threshold    = baseline_mar × lerp(1.35, 1.20, angle_factor)
```

**Sanity ordering check:** After computing, the system enforces:
```
if ear_closed_threshold >= blink_threshold:
    ear_closed_threshold = blink_threshold − 0.01
```
This guarantees the ordering is always: `fatigue > blink > closed`.

#### Worked Example

A driver with `baseline_ear = 0.32`, using a laptop camera (`angle_factor ≈ 0.05`):

```
closed_ratio  = 0.84 + (0.80 − 0.84) × 0.05 = 0.838  →  0.32 × 0.838 = 0.268
blink_ratio   = 0.88 + (0.84 − 0.88) × 0.05 = 0.878  →  0.32 × 0.878 = 0.281
fatigue_ratio = 0.92 + (0.89 − 0.92) × 0.05 = 0.919  →  0.32 × 0.919 = 0.294
```

A driver with `baseline_ear = 0.28`, using a dashboard camera (`angle_factor ≈ 0.70`):

```
closed_ratio  = 0.84 + (0.80 − 0.84) × 0.70 = 0.812  →  0.28 × 0.812 = 0.227
blink_ratio   = 0.88 + (0.84 − 0.88) × 0.70 = 0.852  →  0.28 × 0.852 = 0.239
fatigue_ratio = 0.92 + (0.89 − 0.92) × 0.70 = 0.899  →  0.28 × 0.899 = 0.252
```

The dashboard-camera thresholds are lower, compensating for the geometric compression the angle causes.

---

### 4.6 Post-Calibration Pose Baseline

After calibration completes, in the main detection loop, the computed baseline yaw and pitch are **subtracted from every frame's pose reading** so that the driver looking straight ahead always reads as `(0, 0)`:

```python
yaw   = yaw   − calibrator.baseline_yaw
pitch = pitch − calibrator.baseline_pitch
```

All downstream thresholds (`YAW_THRESHOLD`, `PITCH_DOWN_THRESHOLD`) are then applied to these **relative** values.

---

## 5. Face Detection & Landmark Extraction

The system uses **MediaPipe FaceMesh**, which outputs **468 3D face landmarks** (478 with iris refinement enabled). Each landmark has normalised coordinates `(x, y, z)` where `x` and `y` are relative to frame width/height.

```python
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
    refine_landmarks=IRIS_ENABLED,
)
```

Key landmark indices used throughout the system:

| Purpose | Index | Description |
|---|---|---|
| Nose tip | 1 | Centre reference point |
| Chin | 152 | Bottom face anchor |
| Left eye inner corner | 133 | Yaw / EAR |
| Right eye inner corner | 362 | Yaw / EAR |
| Left eye outer corner | 33 | Yaw / EAR / roll |
| Right eye outer corner | 263 | Yaw / EAR / roll |
| Forehead | 10 | Pitch reference |
| Left cheekbone | 234 | Face width reference |
| Right cheekbone | 454 | Face width reference |
| Left iris centre | 468 | Gaze tracking (with refinement) |
| Right iris centre | 473 | Gaze tracking (with refinement) |
| Mouth left corner | 78 | MAR |
| Upper lip top | 0 | MAR |
| Upper lip mid | 11 | MAR |
| Mouth right corner | 308 | MAR |
| Lower lip mid | 16 | MAR |
| Lower lip bottom | 17 | MAR |

Landmark extraction per frame:
```python
rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
results = face_mesh.process(rgb)
landmarks = results.multi_face_landmarks[0].landmark

# Convert to pixel coordinates
x_px = landmarks[idx].x * frame_width
y_px = landmarks[idx].y * frame_height
```

---

## 6. Head Pose Estimation

Head pose is computed in `face_metrics.py` using a **Multi-Landmark Geometry Method** — measuring face asymmetry directly from 2D landmark positions rather than 3D model fitting. This is more robust at off-axis camera angles.

### 6.1 Yaw (Left / Right Turn)

When the head turns, the nose appears to shift toward one side of the face. The yaw is measured by how offset the nose tip is from the face's geometric centre:

```
face_center_x = (face_left.x + face_right.x) / 2
face_width    = |face_right.x − face_left.x|  + ε

raw_yaw = (nose.x − face_center_x) / (face_width × 0.5)
```

| raw_yaw | Meaning |
|---|---|
| `0.0` | Nose centred → looking straight forward |
| `+1.0` | Extreme right turn |
| `−1.0` | Extreme left turn |

### 6.2 Pitch (Up / Down Tilt)

Pitch measures how far the nose tip sits below the midpoint of the eyes, relative to the total face height:

```
eye_mid_y   = (left_eye_inner.y + right_eye_inner.y) / 2
face_height = |chin.y − forehead.y|  + ε

raw_pitch = (nose.y − eye_mid_y) / (face_height × 0.5)
```

| raw_pitch | Meaning |
|---|---|
| `> 0` | Nose is below eye level → looking down |
| `< 0` | Nose is above eye level → looking up |
| `> 0.35` | Triggers LOOKING DOWN state |

### 6.3 Roll (Head Tilt)

Roll is estimated from the slope of the eye-to-eye axis:

```
eye_dx = right_eye_outer.x − left_eye_outer.x  + ε
eye_dy = right_eye_outer.y − left_eye_outer.y

raw_roll ≈ tan(roll_angle) = eye_dy / eye_dx
```

### 6.4 EMA Smoothing

All three raw pose values are smoothed with an **Exponential Moving Average (EMA)** to reduce frame-to-frame jitter:

```
smooth_yaw[t]   = α × raw_yaw[t]   + (1−α) × smooth_yaw[t−1]
smooth_pitch[t] = α × raw_pitch[t] + (1−α) × smooth_pitch[t−1]
smooth_roll[t]  = α × raw_roll[t]  + (1−α) × smooth_roll[t−1]

where α = 0.40  (EMA_ALPHA)
```

- Higher α → more responsive to movement, but noisier
- Lower α → more stable, but slower to react to fast head turns

The first frame initialises the EMA directly: `smooth = raw` (no averaging).

---

## 7. Eye Aspect Ratio (EAR)

EAR is the primary metric for detecting eye closure. It uses **6 landmarks per eye** arranged in an ellipse around the eye aperture.

### Landmark Layout

```
LEFT_EYE  = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33,  160, 158, 133, 153, 144]

       p1 ─── p2
      /           \
  p0               p3    (horizontal axis)
      \           /
       p5 ─── p4
```

### EAR Formula

```
v1 = ‖p1 − p5‖   ← upper-left to lower-left vertical distance
v2 = ‖p2 − p4‖   ← upper-right to lower-right vertical distance
h1 = ‖p0 − p3‖   ← left corner to right corner horizontal distance

EAR = (v1 + v2) / (2 × h1 + ε)
```

Where `‖·‖` is Euclidean distance and `ε = 1e-6` prevents division by zero.

**Expanding the Euclidean distances:**
```
v1 = √((p1.x − p5.x)² + (p1.y − p5.y)²)
v2 = √((p2.x − p4.x)² + (p2.y − p4.y)²)
h1 = √((p0.x − p3.x)² + (p0.y − p3.y)²)
```

**Typical values:**
| Condition | EAR |
|---|---|
| Eyes fully open | 0.28 – 0.40 |
| Natural blink (mid-blink) | 0.15 – 0.22 |
| Eyes fully closed | 0.00 – 0.15 |

### Dominant EAR Selection

For oblique head angles, the far eye gets geometrically compressed — its vertical landmarks appear closer together, artificially lowering its EAR. A weighted near-eye strategy compensates:

```python
if abs(yaw) > 0.35:           # moderate or stronger head turn
    near_eye = max(ear_left, ear_right)
    far_eye  = min(ear_left, ear_right)
    EAR = 0.75 × near_eye + 0.25 × far_eye
else:
    EAR = (ear_left + ear_right) / 2.0
```

This preserves true bilateral eye closure (microsleep) detection even during mild head turns.

### EAR EMA (Pre-Drowsiness Filter)

An additional EMA is applied to EAR before it enters any drowsiness calculation:

```
ear_ema[t] = 0.45 × ear[t] + (1 − 0.45) × ear_ema[t−1]
```

This reduces noise from camera artefacts (motion blur, lighting flicker) before the signal reaches PERCLOS or the blink timer.

---

## 8. Mouth Aspect Ratio (MAR)

MAR is mathematically identical to EAR but applied to mouth landmarks. It is used to detect yawning.

### Landmark Layout

```
MOUTH = [78, 0, 11, 308, 16, 17]

  p0=78   → left mouth corner
  p1=0    → upper lip top
  p2=11   → upper lip mid
  p3=308  → right mouth corner
  p4=16   → lower lip mid
  p5=17   → lower lip bottom
```

### MAR Formula

```
MAR = (‖p1 − p5‖ + ‖p2 − p4‖) / (2 × ‖p0 − p3‖ + ε)
```

**Typical values:**
| Condition | MAR |
|---|---|
| Mouth closed | 0.20 – 0.35 |
| Slightly open | 0.35 – 0.55 |
| Wide yawn | 0.60 – 1.0+ |

### Calibrated Yawn Threshold

```
mar_yawn_threshold = baseline_mar × lerp(1.35, 1.20, angle_factor)
```

For a driver with `baseline_mar = 0.28` on a laptop camera (`angle_factor = 0.05`):
```
yawn_ratio = 1.35 + (1.20 − 1.35) × 0.05 = 1.343
mar_yawn_threshold = 0.28 × 1.343 = 0.376
```

---

## 9. Drowsiness Detection

All drowsiness signals are tracked inside the `DrowsinessDetector` class (`drowsiness.py`). This class maintains rolling histories and timers across frames.

---

### 9.1 PERCLOS

**PERCLOS** (PERcentage of eye CLOSure over time) is the industry-standard metric for drowsiness assessment. It measures what fraction of recent frames shows the eyes in a closed state.

```
PERCLOS = (number of frames where EAR < ear_closed_threshold)
          ─────────────────────────────────────────────────── × 100%
          (total frames in rolling window)
```

**Rolling window:**
```python
ear_history = deque(maxlen=PERCLOS_WINDOW)   # 75 frames (low-spec) or 150 frames

# Each frame:
ear_history.append(ear_filtered)

closed_frames = sum(1 for e in ear_history if e < ear_closed_threshold)
perclos = (closed_frames / len(ear_history)) * 100.0
```

**Decision →** state machine input:

| PERCLOS | State triggered |
|---|---|
| < 15% | Normal (ALERT) |
| ≥ 15% | FATIGUED |
| ≥ 28% | DROWSY |

At 15 FPS with a 75-frame window, PERCLOS reflects the last ~5 seconds of driving behaviour.

---

### 9.2 Slow Blink Detection

A typical awake blink lasts 100–300 ms. Slow blinks (> 400 ms) are a well-established early fatigue indicator.

#### Phase 1 — Blink Timing

```python
if ear < blink_threshold:
    if blink_start is None:
        blink_start = time.time()    # record when eye began closing
else:
    if blink_start is not None:
        duration_ms = (time.time() - blink_start) * 1000
        blink_durations.append(duration_ms)   # deque, maxlen=10
        blink_start = None                    # reset for next blink
```

#### Phase 2 — Slow Blink Decision

```python
def is_slow_blinking():
    if len(blink_durations) < MIN_BLINKS_TO_JUDGE:   # need >= 3 blinks
        return False
    recent = list(blink_durations)[-5:]               # last 5 blinks
    return mean(recent) > SLOW_BLINK_MS               # mean > 400 ms
```

`is_slow_blinking()` returns `True` only when there is **enough blink history** and the recent average exceeds the threshold — preventing a single unusually long blink from triggering the warning.

---

### 9.3 Microsleep Timer

A microsleep is defined as the eyes remaining **continuously closed for ≥ 1.0 second**. The system uses **wall-clock time** (not frame count) to be reliable at variable frame rates (Pi, network cameras, etc.).

```python
reopen_threshold = ear_closed_threshold + 0.015   # hysteresis band

if ear < reopen_threshold:
    # Eyes still closed (or just at threshold)
    if microsleep_start is None:
        microsleep_start = time.time()
    elapsed = time.time() - microsleep_start
    is_microsleep = (elapsed >= MICROSLEEP_SECONDS)   # 1.0 second

else:
    # Eyes appear open — but require 3 consecutive open frames to reset
    # This prevents a noisy EAR spike from interrupting a genuine microsleep
    open_frames += 1
    if open_frames >= 3:
        microsleep_start  = None
        open_frames       = 0
```

The `+0.015` hysteresis prevents the timer from oscillating ON/OFF when EAR hovers right around the closed threshold.

---

### 9.4 Low-EAR Fatigue Hold

This catches droopy eyelids that **never fully close** — a common early-stage fatigue signal. When EAR stays below the fatigue threshold continuously for 0.8 seconds, a fatigue flag is raised:

```python
if ear < ear_fatigue_threshold:
    if low_ear_start is None:
        low_ear_start = time.time()
    elapsed = time.time() - low_ear_start
    is_low_ear_fatigue = (elapsed >= 0.8)
else:
    low_ear_start = None
```

`is_low_ear_fatigue` is OR'd with `is_slow_blinking()` to form the `slow_blink` flag that feeds into the state machine:

```python
slow_blink = drowsiness.is_slow_blinking() or is_low_ear_fatigue
```

---

### 9.5 Gradual Head-Nod Detection

Detects the characteristic **downward head drift** that occurs as a driver falls asleep at the wheel — a gradual, sustained pitch increase over a short rolling window.

#### Step 1 — Rolling Pitch History

```python
pitch_history = deque of (timestamp, pitch_value)

# Prune samples older than HEAD_NOD_WINDOW_SEC (1.3 s low-spec / 1.0 s normal)
while pitch_history[0].timestamp < now - HEAD_NOD_WINDOW_SEC:
    pitch_history.popleft()
```

#### Step 2 — Drift Measurement

```python
samples     = list(pitch_history)
first_count = max(1, len(samples) // 4)

start_pitch = mean(pitch of first 25% of samples)   # where the head WAS
peak_pitch  = max(pitch of all samples)             # the deepest dip reached

pitch_drop = peak_pitch − start_pitch
```

#### Step 3 — Nod Candidate Conditions

```python
nod_candidate = (
    pitch_drop  >= HEAD_NOD_MIN_DROP      # ≥ 0.13 units (head has drifted far enough)
    and pitch   >= HEAD_NOD_PITCH_LEVEL   # currently looking sufficiently downward
    and (peak_pitch − pitch) <= 0.06     # still near the peak (not yet recovering)
)
```

#### Step 4 — Time Gate

The candidate must be sustained for `HEAD_NOD_HOLD_SEC = 0.40 s` before it is confirmed:

```python
if nod_candidate:
    if head_nod_start is None:
        head_nod_start = time.time()
    elapsed = time.time() - head_nod_start
    is_nod  = (elapsed >= HEAD_NOD_HOLD_SEC)
```

#### Step 5 — Eye Fatigue Fusion

Head nod alone does not trigger microsleep — it must co-occur with eye fatigue evidence, to prevent false triggers from legitimate downward glances (checking instruments):

```python
if head_nod_active:
    nod_eye_confirmed = (
        is_low_ear_fatigue
        or ear_filtered < (ear_fatigue_threshold + 0.01)
        or perclos >= HEAD_NOD_MIN_PERCLOS   # ≥ 10%
    )
    if (not HEAD_NOD_REQUIRE_EYE_FATIGUE) or nod_eye_confirmed:
        is_microsleep = True
        microsleep_elapsed = max(microsleep_elapsed, head_nod_elapsed)
```

`HEAD_NOD_REQUIRE_EYE_FATIGUE = True` by default — the fusion gate is always active.

---

## 10. Phone Detection (YOLOv8)

Phone detection uses a custom-trained **YOLOv8n** model (`best.pt`) running in a **background thread** so it never blocks the main MediaPipe face-mesh loop.

### Architecture

```
Main Loop (every frame)
   │
   ├──→ face_mesh.process(frame)          [blocking, ~20–40 ms]
   │
   └──→ phone_detector.detect(frame)      [non-blocking, returns cached result instantly]
               │
               └──→ Background Thread:    [only every 4th frame, if not already busy]
                       model.predict(frame)
```

### Inference Parameters

| Parameter | Value (low-spec) | Value (normal) | Purpose |
|---|---|---|---|
| Input size | 224 px | 320 px | Smaller = faster inference |
| Confidence threshold | 0.25 | 0.25 | Detection sensitivity |
| NMS IoU threshold | 0.45 | 0.45 | Box deduplication |
| Skip frames | Every 4th | Every 2nd | Reduces GPU/CPU load |
| Persist frames | 20 frames | 20 frames | Holds detection after miss |

### Skip-Frame & Thread-Safety Logic

```python
if frame_count % PHONE_SKIP_FRAMES == 0 and not self._busy:
    self._busy = True
    t = threading.Thread(
        target=self._inference_worker,
        args=(frame.copy(),),    # copy for thread safety
        daemon=True
    )
    t.start()
```

`threading.Lock()` protects the shared `_result` dictionary to prevent race conditions between the inference thread and the main loop reading results.

### Result Persistence

Without persistence, skipped frames would cause the phone indicator to flicker. The system keeps the last positive result alive:

```python
# When inference is positive:
_last_positive_result = current_result
_frames_since_detection = 0

# On every frame (even with no new inference):
_frames_since_detection += 1

if raw_result["phone_detected"]:
    return raw_result
elif _frames_since_detection <= PHONE_PERSIST_FRAMES:
    return _last_positive_result   # carry the last positive forward
```

This means a detected phone stays displayed for 20 frames past the last confirmed detection.

### Class Matching

The system matches against a set of name variants to handle training-time label inconsistencies:

```python
_phone_aliases = {"phone", "phone_use", "cell_phone", "mobile_phone"}
class_match = (cls_id == PHONE_USE_CLASS_ID) or (cls_name in _phone_aliases)
```

### Model Warm-Up

On startup, a dummy black frame is run through the model before real frames arrive:
```python
dummy = np.zeros((480, 640, 3), dtype=np.uint8)
model.predict(dummy, imgsz=PHONE_INPUT_SIZE, conf=0.5, verbose=False)
```
This pre-compiles the CUDA/CPU kernels so the first real inference does not have an outlier-high latency.

---

## 11. Iris & Gaze Tracking

The iris gaze module (`iris_gaze.py`) is **infrastructure-complete but currently disabled** (`IRIS_ENABLED = False`). The `refine_landmarks=True` flag in FaceMesh is already set when enabled, and the landmark infrastructure is ready — only the activation flag needs to be flipped.

### Horizontal Gaze Ratio (per eye)

```
gaze_h = (iris_centre.x − eye_left_corner.x) / (eye_width + ε)
```

- `0.5` → iris centred → looking forward
- `< 0.35` → iris displaced left
- `> 0.65` → iris displaced right

Both eyes are averaged: `gaze_h = (left_gaze_h + right_gaze_h) / 2.0`

### Vertical Gaze Ratio (per eye)

```
gaze_v = (iris_centre.y − eye_top.y) / (eye_height + ε)
```

- Low value → looking straight ahead / up
- `> 0.65` → looking down (at phone in lap)

### Attention State Fusion

```python
def get_attention_state(yaw, pitch, gaze_h, gaze_v):
    head_forward  = abs(yaw) < YAW_THRESHOLD       # 0.45
    eyes_centred  = 0.35 < gaze_h < 0.65
    eyes_down     = gaze_v > 0.65

    if head_forward and eyes_down:       return "PHONE IN LAP"
    if head_forward and not centred:     return "EYES OFF ROAD"
    if not forward  and not centred:     return "DISTRACTED"
    if not forward  and centred:         return "MIRROR CHECK"   ← key distinction
    return "ALERT"
```

The `MIRROR CHECK` state is the primary value of iris fusion: it distinguishes a driver **legitimately checking their mirror** (head turned but eyes still on road) from a genuinely distracted driver (head turned AND eyes away).

---

## 12. State Machine & Priority Logic

The `StateMachine` class (`state_machine.py`) collects all signals computed in a frame and returns the **single most critical driver state** using a priority-based selection system.

### State Priority Table

| Priority | State | Primary Trigger |
|---|---|---|
| 0 | NO FACE | MediaPipe finds no face |
| 1 | ALERT | Default — all signals normal |
| 2 | MIRROR CHECK | Head turned + iris on road |
| 3 | YAWNING | MAR above threshold (sustained) |
| 4 | LOOKING DOWN | Pitch > 0.35 |
| 5 | EYES OFF ROAD | Iris: eyes not centred (head forward) |
| 6 | PHONE IN LAP | Iris: eyes looking down (head forward) |
| 7 | PHONE USE | YOLOv8 phone detection confirmed |
| 8 | DISTRACTED | Yaw > 0.45 |
| 9 | FATIGUED | PERCLOS ≥ 15% OR slow blink |
| 10 | DROWSY | PERCLOS ≥ 28% |
| 11 | MICROSLEEP | Eyes closed continuously ≥ 1.0 s |

### Candidate Selection Algorithm

```python
candidates = ["ALERT"]   # always the baseline

if mar_high_frames >= MAR_SUSTAIN_FRAMES:    candidates.append("YAWNING")
if abs(yaw) >= YAW_THRESHOLD:               candidates.append("DISTRACTED")
if pitch > PITCH_DOWN_THRESHOLD:            candidates.append("LOOKING DOWN")
if phone_detected:                          candidates.append("PHONE USE")
if attention == "EYES OFF ROAD":            candidates.append("EYES OFF ROAD")
if attention == "PHONE IN LAP":             candidates.append("PHONE IN LAP")
if attention == "MIRROR CHECK":             candidates.append("MIRROR CHECK")
if perclos > PERCLOS_FATIGUED:             candidates.append("FATIGUED")
if perclos > PERCLOS_DROWSY:               candidates.append("DROWSY")
if is_microsleep:                          candidates.append("MICROSLEEP")

# Pick the single highest-priority candidate
best_state = max(candidates, key=lambda s: STATES[s])
```

### Yawn State Sustain

MAR is naturally noisy — the mouth opens and closes throughout a yawn. To prevent the YAWNING state from flickering on and off during a single yawn:

```python
if mar > mar_threshold:
    mar_high_frames += 1
    yawn_hold = 15             # hold YAWNING for 15 more frames after last high MAR
else:
    if yawn_hold > 0:
        yawn_hold -= 1         # count down hold timer
    else:
        mar_high_frames = 0    # only reset counter once hold fully expires
```

YAWNING is declared only when `mar_high_frames >= MAR_SUSTAIN_FRAMES` (7 consecutive frames), and is held for 15 frames after the mouth closes.

### Temporal Smoothing (Mode Filter)

To prevent rapid flickering between states (e.g. DROWSY → ALERT → DROWSY over 3 frames), the raw state is passed through a **mode filter**:

```python
state_buffer = deque(maxlen=SMOOTH_BUFFER_SIZE)    # 5 frames
state_buffer.append(raw_state)
smoothed_state = most_frequent_state(state_buffer)
```

A state must be the **most common state across the last 5 frames** to become the output. This means a transient 1-frame spike to MICROSLEEP will not fire unless it dominates the recent history.

### Alert-to-Stage Mapping

The smoothed state is also mapped to a numeric stage for display and server payloads:

| Stage | State | Display Colour |
|---|---|---|
| 0 | ALERT / CALIBRATING / MIRROR CHECK | Green |
| 1 | FATIGUED | Light orange |
| 2 | DROWSY | Orange |
| 3 | MICROSLEEP | Red |
| 4 | YAWNING | Yellow-orange |
| 5 | DISTRACTED | Red |
| 6 | LOOKING DOWN | Dark orange |
| 7 | PHONE USE / PHONE IN LAP | Magenta |
| 8 | EYES OFF ROAD | Deep orange |
| 9 | NO FACE | Grey |

---

## 13. Alert & Server Integration

### Heartbeat

A daemon thread sends a POST to `/heartbeat` every 5 seconds to signal the system is alive:

```json
POST /heartbeat
{ "driver_id": "UUID" }

Response: { "system_enabled": true }
```

### Alert Queue Architecture

Alerts are dispatched asynchronously through a **background queue worker** so network latency never stalls the frame loop:

```
Main Loop:
    _alert_queue.put_nowait((payload, state))

Background Thread:
    while True:
        payload, state = _alert_queue.get()
        requests.post(SERVER_URL + "/alerts", json=payload, timeout=0.5)
```

The queue has `maxsize=64`. If it fills up (e.g. server offline), excess alerts are silently dropped rather than blocking the main loop.

### Cooldown System

The same alert type is suppressed if it was sent less than 5 seconds ago:

```python
alert_key = f"{alert_type}_{severity}"
if now - last_alert_time[alert_key] < ALERT_COOLDOWN:
    return   # still in cooldown — skip
last_alert_time[alert_key] = now
```

### Alert Payload

```json
{
  "driver_id":       "UUID",
  "alert_type":      "drowsy",
  "severity":        "DANGER",
  "message":         "Driver state: DROWSY",
  "sound":           true,
  "confidence":      0.87,
  "detection_class": "DROWSY"
}
```

### State → Alert Mapping

| Driver State | alert_type | severity | Sound |
|---|---|---|---|
| DROWSY | drowsy | DANGER | ✓ |
| MICROSLEEP | microsleep | DANGER | ✓ |
| FATIGUED | fatigue | WARNING | ✗ |
| YAWNING | yawning | WARNING | ✗ |
| DISTRACTED | looking_away | WARNING | ✓ |
| LOOKING DOWN | looking_away | WARNING | ✗ |
| PHONE USE | phone_use | DANGER | ✓ |
| EYES OFF ROAD | looking_away | WARNING | ✓ |
| NO FACE | no_face | WARNING | ✗ |

Alerts are only sent when `smoothed_state != "ALERT"` and `!= "CALIBRATING"`.

### Calibration Status Events

The system emits structured JSON to stdout so the Node.js server process can parse and relay calibration progress to the mobile app:

```json
[CALIB_STATUS]{ "status": "IN_PROGRESS", "progressPercent": 60,
                "framesCollected": 18, "totalFrames": 30,
                "instruction": "Look forward and stay still.",
                "attempt": 1, "autoRetryUsed": false }
```

Possible status values: `IDLE`, `IN_PROGRESS`, `REJECTED`, `FAILED`, `COMPLETED`.

---

## 14. Signal Smoothing Summary

| Signal | Method | Parameter |
|---|---|---|
| Head pose yaw/pitch/roll | EMA | α = 0.40 |
| EAR (pre-drowsiness) | EMA | α = 0.45 |
| Driver overall state | Mode filter (deque) | Window = 5 frames |
| PERCLOS | Rolling closed-frame count | Window = 75–150 frames |
| Slow blink | Mean of last 5 blink durations | Min 3 blinks required |
| Microsleep | Wall-clock timer + 3-frame reopen debounce | Threshold = 1.0 s |
| Head nod | Time-windowed pitch drift + hold timer | Window = 1.3 s, Hold = 0.4 s |
| Phone detection | Positive-result persistence | 20 frames |

---

## 15. Full Frame Processing Loop

This is the complete per-frame execution path in `main.py`:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  FRAME N                                                                │
│                                                                         │
│  1. Check command queue → handle "recalibrate" from app                │
│                                                                         │
│  2. cap.read() → raw frame                                              │
│       └─ cv2.resize → (480×360 or 640×480)                             │
│       └─ cv2.flip(1) → mirror effect for laptop webcam                 │
│                                                                         │
│  3. [BACKGROUND] PhoneDetector.detect(frame)                            │
│       └─ Returns cached YOLOv8 result immediately (non-blocking)       │
│       └─ Queues new inference every 4th frame if thread is free        │
│                                                                         │
│  4. face_mesh.process(RGB frame)                                        │
│       └─ MediaPipe FaceMesh: 468–478 landmarks                         │
│                                                                         │
│  ── IF FACE FOUND ───────────────────────────────────────────────────── │
│                                                                         │
│  5. HEAD POSE  (face_metrics.get_head_pose)                             │
│       └─ Compute raw yaw, pitch, roll from 2D landmark geometry        │
│       └─ EMA smooth (α=0.40) → smooth yaw, pitch, roll                │
│       └─ Subtract calibration baseline → relative pose (0=forward)    │
│                                                                         │
│  6. EAR  (face_metrics.get_dominant_ear)                                │
│       └─ Compute EAR for left eye (6 landmarks)                        │
│       └─ Compute EAR for right eye (6 landmarks)                       │
│       └─ Weighted average based on yaw turn angle                      │
│       └─ drowsiness.filter_ear → EMA smooth (α=0.45)                  │
│                                                                         │
│  7. MAR  (face_metrics.get_mar)                                         │
│       └─ Compute MAR from 6 mouth landmarks                            │
│                                                                         │
│  8. GAZE  (iris_gaze.get_gaze / get_attention_state)                   │
│       └─ Currently returns UNKNOWN (iris disabled)                     │
│                                                                         │
│  ── IF NOT YET CALIBRATED ──────────────────────────────────────────── │
│       └─ calibrator.update(ear, yaw, pitch, mar)                       │
│       └─ Emit calibration progress to stdout                           │
│       └─ draw_calibration(frame, progress%) → show on screen          │
│       └─ continue (skip detection)                                     │
│                                                                         │
│  ── IF CALIBRATED ──────────────────────────────────────────────────── │
│                                                                         │
│  9. DROWSINESS SIGNALS  (drowsiness.*)                                  │
│       └─ update_ear_history(ear)  → append to PERCLOS window          │
│       └─ process_blink(ear)       → track blink start/end/duration    │
│       └─ get_perclos()            → closed% over rolling window        │
│       └─ is_slow_blinking()       → mean blink > 400ms ?               │
│       └─ check_low_ear_fatigue()  → ear below fatigue for 0.8 s ?     │
│       └─ check_microsleep()       → eyes closed for ≥ 1.0 s ?         │
│       └─ check_gradual_head_nod() → pitch drifted down over 1.3 s ?   │
│       └─ [FUSION] head_nod + eye_evidence → override is_microsleep    │
│                                                                         │
│ 10. STATE MACHINE  (state_machine.determine_state)                     │
│       └─ Build candidate list from all signals                         │
│       └─ max(candidates, key=priority) → raw_state                    │
│       └─ get_smoothed_state → mode filter over 5 frames               │
│                                                                         │
│ 11. DISPLAY                                                             │
│       └─ draw_dashboard: status bar + metrics panel + FPS             │
│       └─ draw_eye_contours if DRAW_EYE_CONTOURS=True                  │
│       └─ Full-screen flash overlays for MICROSLEEP / DROWSY / YAWNING │
│       └─ PhoneDetector.draw_detection: bounding box + label           │
│       └─ cv2.imshow(frame)                                             │
│                                                                         │
│ 12. SERVER                                                              │
│       └─ send_alert(smoothed_state) → put on non-blocking queue       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Key Tunable Constants Reference

### Detection Thresholds (`config.py`)

| Constant | Default | Description |
|---|---|---|
| `YAW_THRESHOLD` | 0.45 | Yaw ratio to declare distraction |
| `PITCH_DOWN_THRESHOLD` | 0.35 | Pitch ratio to declare looking down |
| `PITCH_UP_THRESHOLD` | −0.30 | Pitch ratio to declare looking up |
| `MICROSLEEP_SECONDS` | 1.0 s | Eye-closed duration → microsleep |
| `SLOW_BLINK_MS` | 400 ms | Blink duration threshold |
| `MIN_BLINKS_TO_JUDGE` | 3 | Blinks needed before slow blink verdict |
| `PERCLOS_FATIGUED` | 15.0 % | PERCLOS → FATIGUED |
| `PERCLOS_DROWSY` | 28.0 % | PERCLOS → DROWSY |
| `MAR_SUSTAIN_FRAMES` | 7 | Consecutive high-MAR frames to confirm yawn |

### Calibration

| Constant | Default | Description |
|---|---|---|
| `CALIBRATION_FRAMES` | 30 | Frames collected for baseline |
| `EAR_FATIGUE_RATIO` | 0.90 | baseline × ratio = fatigue EAR |
| `EAR_CLOSED_RATIO` | 0.78 | baseline × ratio = closed EAR |
| `BLINK_EAR_RATIO` | 0.82 | baseline × ratio = blink EAR |
| `MAR_YAWN_RATIO` | 1.25 | baseline × ratio = yawn MAR |

### Head Nod

| Constant | Default | Description |
|---|---|---|
| `HEAD_NOD_WINDOW_SEC` | 1.30 s (low) / 1.00 s | Pitch history window |
| `HEAD_NOD_MIN_DROP` | 0.13 (low) / 0.11 | Min pitch drift to qualify |
| `HEAD_NOD_PITCH_LEVEL` | PITCH_DOWN + 0.08 | Must be looking down enough |
| `HEAD_NOD_HOLD_SEC` | 0.40 s (low) / 0.32 s | Must persist this long |
| `HEAD_NOD_MIN_PERCLOS` | 10.0 % | PERCLOS needed for nod fusion |
| `HEAD_NOD_REQUIRE_EYE_FATIGUE` | True | Enable eye-evidence fusion gate |

### Phone Detection

| Constant | Default | Description |
|---|---|---|
| `PHONE_CONF_THRESHOLD` | 0.25 | YOLOv8 minimum confidence |
| `PHONE_SKIP_FRAMES` | 4 (low) / 2 (normal) | Inference frequency |
| `PHONE_PERSIST_FRAMES` | 20 | Frames to hold positive result |
| `PHONE_INPUT_SIZE` | 224 (low) / 320 px | YOLOv8 input resolution |

### Timing & Performance

| Constant | Default | Description |
|---|---|---|
| `ALERT_COOLDOWN` | 5 s | Minimum gap between same alert type |
| `HEARTBEAT_INTERVAL_SEC` | 5.0 s | Server heartbeat interval |
| `SMOOTH_BUFFER_SIZE` | 5 frames | State mode filter window |
| `PERCLOS_WINDOW` | 75 (low) / 150 frames | Rolling eye-closure window |
| `FRAME_WIDTH × HEIGHT` | 480×360 (low) / 640×480 | Processing resolution |
| `LOW_SPEC_MODE` | True | Reduces resolution and window sizes |

---

*Document generated from source code analysis of the Sisuraksha Driver Monitoring System — `driver_monitoring/` module suite.*
