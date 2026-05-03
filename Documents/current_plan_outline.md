# Sisuraksha Current Plan Outline (Presentation Focus)

Last updated: 2026-04-22

## 1. Current Goal

Deliver a reliable, presentation-ready demo that proves my assigned work is functional, even without depending on unstable internet or full-system connectivity.

## 2. Current Constraint

- The ESP32-CAM stream is currently buffering heavily and is not reliable enough for live model inference.
- Because of this, using ESP32-CAM as the main live video source is paused for now.

## 3. Decision for Now

Use the older, more stable approach for video input:

- Stream video from a phone using an IP camera app.
- Feed that stream into the two vision components/models for processing.

This lets development continue while ESP32-CAM reliability is improved later.

## 4. Main Workstreams

### A. Video Input Path (Immediate)

- [ ] Configure phone IP camera stream with stable local URL.
- [ ] Connect both processing components to the same stream source (or synchronized streams if needed).
- [ ] Validate frame rate and latency are good enough for live detection.
- [ ] Add a quick reconnect/fallback workflow in case the stream drops during demo.

### B. Improve Both Components (UI + Logic)

- [ ] Improve UI clarity for each component (status, detections, confidence, alerts).
- [ ] Improve logic robustness (threshold tuning, noise filtering, fewer false positives).
- [ ] Add clear "system state" indicators (camera connected, model active, alert state).
- [ ] Prepare demo-friendly visual outputs that are easy to explain in presentation.

### C. Footboard Safety Standalone Demo (Separate from Main System)

This is now the highest-priority demo track.

- [ ] Build a separate mobile interface for footboard safety only.
- [ ] Show IR sensor input clearly in the UI (safe/unsafe state + alert message).
- [ ] Ensure this demo works without internet (local/offline path).
- [ ] Enable showing the same interface/output from PC during presentation.

## 5. Why This Split Strategy

- The current full system still depends on internet/network stability to start and run fully.
- For presentation, I need a dependable demo that highlights my own implemented module.
- A standalone footboard safety demo reduces failure points and gives a stronger live demonstration.

## 6. Deferred Work (After Presentation Stability)

- Resume ESP32-CAM optimization and reduce buffering.
- Reintegrate improved camera path into full end-to-end architecture.
- Reconnect standalone improvements back into the full internet-enabled system.

## 7. Demo Success Criteria

- [ ] Live sensor-driven UI response visible in real time.
- [ ] Footboard safety alerts trigger correctly from IR sensor events.
- [ ] Demo runs without internet dependency.
- [ ] Demo can be shown from both mobile and PC during presentation.

## 8. Open Questions to Confirm

1. For the footboard standalone demo, should the PC view be a web dashboard mirror, screen cast, or direct desktop UI?
2. Do you want only binary states in UI (SAFE/UNSAFE), or also confidence/timestamps/history?
3. Should the phone IP camera stream be temporary for presentation only, or remain as a fallback mode in final system design?
4. Do you want a short day-by-day timeline added to this plan?