# Debug all metrics — run alone with no other python processes
import sys, cv2, mediapipe as mp, numpy as np
sys.path.insert(0, '.')
from config import MOUTH, PITCH_DOWN_THRESHOLD, YAW_THRESHOLD
from face_metrics import get_yaw, get_pitch, get_ear_avg, get_mar

fm = mp.solutions.face_mesh.FaceMesh(
    max_num_faces=1, min_detection_confidence=0.5,
    min_tracking_confidence=0.5, refine_landmarks=True)
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

print(f"Config: PITCH_DOWN_THRESHOLD={PITCH_DOWN_THRESHOLD}, YAW_THRESHOLD={YAW_THRESHOLD}")
print("Look straight at camera. Press 'q' to quit.")
print("=" * 70)

while True:
    ret, frame = cap.read()
    if not ret:
        continue
    h, w = frame.shape[:2]
    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    r = fm.process(rgb)

    if r.multi_face_landmarks:
        lm = r.multi_face_landmarks[0].landmark
        yaw   = get_yaw(lm)
        pitch = get_pitch(lm)
        ear   = get_ear_avg(lm, w, h)
        mar   = get_mar(lm, MOUTH, w, h)

        flags = []
        if pitch > PITCH_DOWN_THRESHOLD:
            flags.append("LOOKING_DOWN!")
        if abs(yaw) > YAW_THRESHOLD:
            flags.append("DISTRACTED!")
        if mar > 0.45:
            flags.append("YAWNING!")
        flag_str = " | ".join(flags) if flags else "ALERT"

        txt = f"yaw={yaw:6.1f}  pitch={pitch:6.1f}  ear={ear:.3f}  mar={mar:.3f}  >> {flag_str}"
        print(txt)

        cv2.putText(frame, f"Yaw:{yaw:.1f} Pitch:{pitch:.1f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
        cv2.putText(frame, f"EAR:{ear:.3f} MAR:{mar:.3f}", (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
        cv2.putText(frame, flag_str, (10, 100),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255), 2)
    else:
        print("NO FACE")
        cv2.putText(frame, "NO FACE", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0,0,255), 2)

    cv2.imshow("Debug All Metrics", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
fm.close()
