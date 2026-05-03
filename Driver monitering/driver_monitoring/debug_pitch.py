import cv2, mediapipe as mp, statistics, time
fm = mp.solutions.face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True)
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
time.sleep(2)  # let camera warm up
for _ in range(20): cap.read()  # discard initial frames
vals = []
for _ in range(60):
    ret, f = cap.read()
    if not ret: continue
    r = fm.process(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
    if r.multi_face_landmarks:
        lm = r.multi_face_landmarks[0].landmark
        pitch = (lm[1].y - ((lm[33].y + lm[263].y) / 2)) * 100
        yaw_val = (lm[1].x - ((lm[234].x + lm[454].x) / 2)) * 100
        vals.append((pitch, yaw_val))
        print(f"pitch={pitch:.2f}  yaw={yaw_val:.2f}")
cap.release(); fm.close()
pitches = [v[0] for v in vals]
print(f"\nPitch: min={min(pitches):.2f} max={max(pitches):.2f} mean={statistics.mean(pitches):.2f}")
print("Set PITCH_DOWN_THRESHOLD above the max to avoid false triggers")
