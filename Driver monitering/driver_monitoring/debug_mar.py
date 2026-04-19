# Quick debug script — prints MAR values live to terminal
# Press 'q' to quit

import sys
import cv2
import numpy as np
import mediapipe as mp

sys.path.insert(0, '.')
from config import MOUTH, FRAME_WIDTH, FRAME_HEIGHT, CAMERA_INDEX
from face_metrics import get_mar

face_mesh = mp.solutions.face_mesh.FaceMesh(
    max_num_faces=1, min_detection_confidence=0.5,
    min_tracking_confidence=0.5, refine_landmarks=True)

cap = cv2.VideoCapture(CAMERA_INDEX)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

print("Yawn now — watching MAR values (6pt). Press 'q' to quit.")
print("Threshold = 0.35.  Closed mouth ~0.14, Yawn ~0.5+")
print("-" * 50)

while True:
    ret, frame = cap.read()
    if not ret:
        continue
    h, w = frame.shape[:2]
    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    if results.multi_face_landmarks:
        lm = results.multi_face_landmarks[0].landmark
        mar = get_mar(lm, MOUTH, w, h)

        label = " <<< YAWNING!" if mar > 0.35 else ""
        print(f"MAR: {mar:.3f}{label}")

        color = (0, 0, 255) if mar > 0.35 else (0, 255, 0)
        cv2.putText(frame, f"MAR: {mar:.3f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
        if mar > 0.35:
            cv2.putText(frame, "YAWNING", (10, 70),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 3)

    cv2.imshow("MAR Debug", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
face_mesh.close()
