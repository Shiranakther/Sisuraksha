# Debug script to test phone detection model output
import sys
import cv2
import numpy as np
import time

sys.path.insert(0, '.')
from config import (PHONE_MODEL_PATH, PHONE_INPUT_SIZE, 
                     PHONE_CONF_THRESHOLD, PHONE_CLASS_NAMES)

print(f"Model: {PHONE_MODEL_PATH}")
print(f"Input size: {PHONE_INPUT_SIZE}")
print(f"Conf threshold: {PHONE_CONF_THRESHOLD}")
print(f"Classes: {PHONE_CLASS_NAMES}")

# Load model
net = cv2.dnn.readNetFromONNX(PHONE_MODEL_PATH)
print("Model loaded OK")

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print("\nHold your phone up. Press 'q' to quit.\n")

frame_count = 0
while True:
    ret, frame = cap.read()
    if not ret:
        continue
    
    frame = cv2.flip(frame, 1)
    h_orig, w_orig = frame.shape[:2]
    
    blob = cv2.dnn.blobFromImage(
        frame, 1.0/255.0, (PHONE_INPUT_SIZE, PHONE_INPUT_SIZE),
        swapRB=True, crop=False
    )
    net.setInput(blob)
    outputs = net.forward()
    
    # Check raw output shape
    if frame_count == 0:
        print(f"Raw output shape: {outputs.shape}")
        # outputs shape: (1, 4+num_classes, 8400)
    
    preds = outputs[0].T  # (8400, 4+nc)
    
    if frame_count == 0:
        print(f"Transposed shape: {preds.shape}")
        print(f"Columns: 4 box coords + {preds.shape[1] - 4} class scores")
    
    # Get all detections above a LOW threshold for debugging
    debug_thresh = 0.20
    scores_all = preds[:, 4:]  # class scores only
    max_scores = np.max(scores_all, axis=1)
    max_classes = np.argmax(scores_all, axis=1)
    
    # Count detections at various thresholds
    above_20 = np.sum(max_scores > 0.20)
    above_30 = np.sum(max_scores > 0.30)
    above_45 = np.sum(max_scores > 0.45)
    above_50 = np.sum(max_scores > 0.50)
    
    # Count per class
    phone_mask = max_classes == 1  # phone_use class
    normal_mask = max_classes == 0  # normal class
    phone_above_20 = np.sum((max_scores > 0.20) & phone_mask)
    phone_above_30 = np.sum((max_scores > 0.30) & phone_mask)
    normal_above_20 = np.sum((max_scores > 0.20) & normal_mask)
    
    top_score = float(np.max(max_scores))
    top_class = int(np.argmax(np.max(scores_all, axis=0)))
    
    # Draw best phone_use detection if any
    phone_scores = scores_all[:, 1]  # phone_use class scores
    best_idx = np.argmax(phone_scores)
    best_phone_score = float(phone_scores[best_idx])
    
    if best_phone_score > 0.15:
        cx, cy, bw, bh = preds[best_idx, :4]
        x1 = int((cx - bw/2) * w_orig / PHONE_INPUT_SIZE)
        y1 = int((cy - bh/2) * h_orig / PHONE_INPUT_SIZE)
        x2 = int((cx + bw/2) * w_orig / PHONE_INPUT_SIZE)
        y2 = int((cy + bh/2) * h_orig / PHONE_INPUT_SIZE)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(frame, f"phone: {best_phone_score:.2f}", (x1, y1-5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
    
    # On-screen debug info
    info = [
        f"Top score: {top_score:.3f} (class {PHONE_CLASS_NAMES[top_class]})",
        f"Best phone_use score: {best_phone_score:.3f}",
        f">0.20: {above_20} (phone:{phone_above_20} normal:{normal_above_20})",
        f">0.30: {above_30}  >0.45: {above_45}  >0.50: {above_50}",
    ]
    for i, txt in enumerate(info):
        cv2.putText(frame, txt, (10, 30 + i*25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
    
    if frame_count % 30 == 0:
        print(f"Frame {frame_count}: top={top_score:.3f}({PHONE_CLASS_NAMES[top_class]})  "
              f"best_phone={best_phone_score:.3f}  "
              f"dets>0.20={above_20} phone>0.20={phone_above_20}")
    
    cv2.imshow("Phone Detection Debug", frame)
    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        break
    
    frame_count += 1

cap.release()
cv2.destroyAllWindows()
