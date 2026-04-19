"""
═══════════════════════════════════════════════════════════════
  PHONE DETECTION DEBUG — Live webcam test
  Tests best.pt at multiple settings and shows ALL detections
  (both "normal" and "phone_use" classes) so you can see
  exactly what the model is doing.

  Press 'q' to quit.
  Press '1' for imgsz=320, '2' for 480, '3' for 640
  Press '+'/'-' to adjust confidence threshold
═══════════════════════════════════════════════════════════════
"""

import sys
import time
import cv2
import numpy as np

# ── Load model ────────────────────────────────────────
print("[1/3] Loading ultralytics YOLO...")
from ultralytics import YOLO

MODEL_PATH = "best.pt"
model = YOLO(MODEL_PATH)
print(f"[2/3] Model loaded. Classes: {model.names}")

# ── Warm up ───────────────────────────────────────────
dummy = np.zeros((480, 640, 3), dtype=np.uint8)
model.predict(dummy, imgsz=320, conf=0.1, verbose=False)
print("[3/3] Warm-up done.\n")

# ── Settings ──────────────────────────────────────────
imgsz = 640           # start at full resolution for best accuracy
conf_thresh = 0.10    # very low to see ALL detections
CLASS_COLORS = {
    0: (0, 255, 0),    # normal = green
    1: (0, 0, 255),    # phone_use = red
}

# ── Open webcam ──────────────────────────────────────
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
if not cap.isOpened():
    print("[ERROR] Cannot open webcam")
    sys.exit(1)

print("╔════════════════════════════════════════════════╗")
print("║  PHONE DETECTION DEBUG — LIVE                 ║")
print("║  Keys: q=quit  1/2/3=resolution  +/-=conf     ║")
print("║  Showing ALL detections (normal + phone_use)  ║")
print("╚════════════════════════════════════════════════╝")
print(f"  Model: {MODEL_PATH}")
print(f"  Classes: {model.names}")
print(f"  Initial: imgsz={imgsz}, conf={conf_thresh:.2f}\n")

frame_count = 0
while True:
    ret, frame = cap.read()
    if not ret:
        continue

    frame = cv2.flip(frame, 1)  # mirror
    h, w = frame.shape[:2]
    frame_count += 1

    # ── Run inference ─────────────────────────────────
    t0 = time.time()
    results = model.predict(frame, imgsz=imgsz, conf=conf_thresh, verbose=False)
    infer_ms = (time.time() - t0) * 1000

    # ── Parse ALL detections ──────────────────────────
    boxes = results[0].boxes
    n_total = len(boxes)
    n_phone = 0
    det_info = []

    for i in range(n_total):
        cls_id = int(boxes.cls[i].item())
        conf = float(boxes.conf[i].item())
        x1, y1, x2, y2 = [int(v) for v in boxes.xyxy[i].tolist()]
        cls_name = model.names.get(cls_id, f"cls{cls_id}")

        if cls_id == 1:
            n_phone += 1

        color = CLASS_COLORS.get(cls_id, (255, 255, 0))
        # Draw box
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        label = f"{cls_name} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
        cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
        cv2.putText(frame, label, (x1 + 2, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

        det_info.append(f"  {cls_name}: {conf:.3f}  box=({x1},{y1})-({x2},{y2})")

    # ── Console output (every 10 frames) ──────────────
    if frame_count % 10 == 0:
        phone_tag = "*** PHONE ***" if n_phone > 0 else ""
        print(f"[F{frame_count:5d}] imgsz={imgsz} conf>={conf_thresh:.2f} | "
              f"{infer_ms:6.0f}ms | {n_total} det ({n_phone} phone) {phone_tag}")
        for info in det_info:
            print(info)

    # ── On-screen HUD ─────────────────────────────────
    hud_lines = [
        f"imgsz={imgsz}  conf>={conf_thresh:.2f}",
        f"Infer: {infer_ms:.0f}ms  Detections: {n_total}  Phone: {n_phone}",
        f"Keys: 1/2/3=res  +/-=conf  q=quit",
    ]
    for i, line in enumerate(hud_lines):
        cv2.putText(frame, line, (10, 25 + i * 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)

    # Big alert if phone detected
    if n_phone > 0:
        cv2.rectangle(frame, (0, 0), (w, h), (0, 0, 255), 8)
        cv2.putText(frame, "PHONE DETECTED", (w // 2 - 160, h // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.3, (0, 0, 255), 4)

    cv2.imshow("Phone Detection Debug", frame)

    # ── Key handling ──────────────────────────────────
    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        break
    elif key == ord('1'):
        imgsz = 320
        print(f"\n>> Resolution changed to {imgsz}\n")
    elif key == ord('2'):
        imgsz = 480
        print(f"\n>> Resolution changed to {imgsz}\n")
    elif key == ord('3'):
        imgsz = 640
        print(f"\n>> Resolution changed to {imgsz}\n")
    elif key in (ord('+'), ord('=')):
        conf_thresh = min(conf_thresh + 0.05, 0.95)
        print(f"\n>> Confidence threshold: {conf_thresh:.2f}\n")
    elif key == ord('-'):
        conf_thresh = max(conf_thresh - 0.05, 0.05)
        print(f"\n>> Confidence threshold: {conf_thresh:.2f}\n")

cap.release()
cv2.destroyAllWindows()
print("\n[DONE] Debug session ended.")
