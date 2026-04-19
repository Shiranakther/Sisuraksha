# Test different landmark pairs to find best MAR measurement
import sys, cv2, numpy as np, mediapipe as mp

face_mesh = mp.solutions.face_mesh.FaceMesh(
    max_num_faces=1, min_detection_confidence=0.5,
    min_tracking_confidence=0.5, refine_landmarks=True)

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

# Candidate vertical lip pairs
pairs = {
    "13-14":  (13, 14),    # inner lip closure line
    "82-87":  (82, 87),    # inner lip 2
    "0-17":   (0, 17),     # outer lip top/bottom
    "12-15":  (12, 15),
    "11-16":  (11, 16),
    "37-84":  (37, 84),    # upper lip edge near corners
    "267-317":(267,317),
    "81-178": (81,178),
    "80-179": (80,179),
    "82-312": (82,312),
}
# Horizontal: 78-308

print("Open your mouth wide / yawn to see which pair responds best")
print("=" * 90)
count = 0

while True:
    ret, frame = cap.read()
    if not ret: continue
    h, w = frame.shape[:2]
    frame = cv2.flip(frame, 1)
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    if results.multi_face_landmarks:
        lm = results.multi_face_landmarks[0].landmark
        horiz = np.linalg.norm(
            np.array([lm[78].x*w, lm[78].y*h]) -
            np.array([lm[308].x*w, lm[308].y*h]))

        parts = []
        for name, (t, b) in pairs.items():
            vert = np.linalg.norm(
                np.array([lm[t].x*w, lm[t].y*h]) -
                np.array([lm[b].x*w, lm[b].y*h]))
            ratio = vert / (horiz + 1e-6)
            parts.append(f"{name}:{ratio:.3f}")

        count += 1
        if count % 10 == 0:  # print every 10th frame to reduce spam
            print("  ".join(parts))

    cv2.imshow("Landmark Test", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
face_mesh.close()
