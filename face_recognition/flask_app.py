"""
Sisuraksha — Face Recognition Flask Service
Port: 5002

Endpoints:
  GET  /                → Health check
  POST /api/add_user    → Register child (3 face images → 3 embeddings)
  POST /api/check_user  → Verify face (1 image vs stored embeddings)
"""

import os
import time
import base64
import io

import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from scipy.spatial.distance import cosine
from mtcnn import MTCNN

# Suppress TensorFlow warnings
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'

from keras_facenet import FaceNet

# ─── App Setup ───────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

# ─── Model Loading ───────────────────────────────────────────────────────────

print("[INIT] Loading FaceNet model...")
t = time.time()
embedder = FaceNet()
print(f"[INIT] FaceNet loaded in {(time.time() - t)*1000:.0f}ms")

print("[INIT] Loading MTCNN detector...")
t = time.time()
detector = MTCNN()
print(f"[INIT] MTCNN loaded in {(time.time() - t)*1000:.0f}ms")

CONFIDENCE_THRESHOLD = 70.0  # Minimum match confidence %
FACE_DETECTION_CONFIDENCE = 0.75  # MTCNN min face confidence

# ─── Helper Functions ────────────────────────────────────────────────────────


def fix_image_orientation(img):
    """No-op — rotation is now handled inside extract_face_mtcnn by
    trying all 4 orientations and picking the best detection."""
    return img


def preprocess_image(img):
    """Enhance image quality using CLAHE for varying lighting conditions."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)

    lab = cv2.merge([l, a, b])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    return enhanced


def extract_face_mtcnn(frame, min_confidence=None):
    """Detect and crop faces using MTCNN.
    Tries all 4 rotations (0/90/180/270) and returns the faces from whichever
    orientation gives the highest detection confidence.
    Returns list of 160x160 face images.
    """
    threshold = min_confidence if min_confidence is not None else FACE_DETECTION_CONFIDENCE
    candidates = [
        frame,
        cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE),
        cv2.rotate(frame, cv2.ROTATE_180),
        cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE),
    ]

    best_faces = []
    best_conf = 0.0

    for rotated in candidates:
        rgb = cv2.cvtColor(rotated, cv2.COLOR_BGR2RGB)
        results = detector.detect_faces(rgb)

        faces = []
        max_conf = 0.0
        for result in results:
            confidence = result['confidence']
            if confidence < threshold:
                continue
            x, y, w, h = result['box']
            pad = int(0.1 * w)
            x1 = max(0, x - pad)
            y1 = max(0, y - pad)
            x2 = min(rotated.shape[1], x + w + pad)
            y2 = min(rotated.shape[0], y + h + pad)
            face = rotated[y1:y2, x1:x2]
            if face.size == 0:
                continue
            face = cv2.resize(face, (160, 160))
            faces.append(face)
            if confidence > max_conf:
                max_conf = confidence

        if faces and max_conf > best_conf:
            best_faces = faces
            best_conf = max_conf

    return best_faces


def get_embedding(face_img):
    """Generate a 512-dim FaceNet embedding from a 160x160 face image.
    Returns L2-normalized embedding.
    """
    face_rgb = cv2.cvtColor(face_img, cv2.COLOR_BGR2RGB)
    face_array = np.expand_dims(face_rgb, axis=0)
    embedding = embedder.embeddings(face_array)[0]

    # L2 normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm

    return embedding


def embedding_to_base64(emb):
    """Convert a NumPy embedding array to a base64 string."""
    raw_bytes = emb.astype(np.float32).tobytes()
    return base64.b64encode(raw_bytes).decode('utf-8')


def base64_to_embedding(b64_str):
    """Convert a base64 string back to a NumPy embedding array."""
    raw_bytes = base64.b64decode(b64_str)
    return np.frombuffer(raw_bytes, dtype=np.float32)


def compute_similarity(emb, stored_emb):
    """Compute cosine similarity between two embeddings. Returns percentage (0-100)."""
    similarity = 1 - cosine(emb, stored_emb)
    return max(0, similarity * 100)


def decode_base64_image(b64_string):
    """Decode a base64 encoded image string to an OpenCV image."""
    # Handle data URI prefix (e.g., "data:image/jpeg;base64,...")
    if ',' in b64_string:
        b64_string = b64_string.split(',', 1)[1]

    img_bytes = base64.b64decode(b64_string)
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    return img


def image_to_base64(img):
    """Convert an OpenCV image to a base64 JPEG string."""
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')


# ─── Routes ──────────────────────────────────────────────────────────────────


@app.route('/', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        "status": "running",
        "model_loaded": embedder is not None,
        "detector_loaded": detector is not None
    })


@app.route('/api/add_user', methods=['POST'])
def add_user():
    """Register a new child — receives 3 face images, returns 3 base64 embeddings.

    Request: multipart/form-data
      - user_name: string
      - employee_master_id: string (child_id)
      - images: File[] (3 image files)

    Response: JSON with base64 embeddings array
    """
    total_start = time.time()

    user_name = request.form.get('user_name', 'Unknown')
    employee_master_id = request.form.get('employee_master_id', '')
    images = request.files.getlist('images')

    if not images or len(images) == 0:
        return jsonify({"error": "No images uploaded"}), 400

    embeddings = []
    sample_base64 = None

    for i, img_file in enumerate(images):
        try:
            # Read image from file upload
            t = time.time()
            file_bytes = np.frombuffer(img_file.read(), np.uint8)
            img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
            print(f"[TIMING] Image {i+1} decode: {(time.time() - t)*1000:.0f}ms")

            if img is None:
                print(f"[WARN] Image {i+1} could not be decoded, skipping")
                continue

            # Preprocess
            t = time.time()
            img = preprocess_image(img)
            print(f"[TIMING] Image {i+1} preprocess: {(time.time() - t)*1000:.0f}ms")

            # Detect face
            t = time.time()
            faces = extract_face_mtcnn(img)
            print(f"[TIMING] Image {i+1} face detection: {(time.time() - t)*1000:.0f}ms")

            if len(faces) == 0:
                print(f"[WARN] No face detected in image {i+1}, skipping")
                continue

            # Use the first detected face
            face_img = faces[0]

            # Generate embedding
            t = time.time()
            emb = get_embedding(face_img)
            print(f"[TIMING] Image {i+1} embedding generation: {(time.time() - t)*1000:.0f}ms")

            emb_b64 = embedding_to_base64(emb)
            embeddings.append(emb_b64)

            # Keep a sample for debugging
            if sample_base64 is None:
                sample_base64 = image_to_base64(face_img)

        except Exception as e:
            print(f"[ERROR] Processing image {i+1}: {str(e)}")
            continue

    total_time = (time.time() - total_start) * 1000
    print(f"[TIMING] TOTAL add_user: {total_time:.0f}ms")

    if len(embeddings) == 0:
        return jsonify({"error": "No valid faces detected in uploaded images"}), 400

    return jsonify({
        "status": "success",
        "message": f"User '{user_name}' (ID: {employee_master_id}) processed with {len(embeddings)} faces.",
        "embeddings": embeddings,
        "faces_saved": len(embeddings),
        "employee_master_id": employee_master_id,
        "sample_base64": sample_base64
    })


@app.route('/api/check_user', methods=['POST'])
def check_user():
    """Match a face for attendance — receives 1 image + stored embeddings.

    Request JSON:
      - image: base64 encoded image string
      - embeddings: array of { child_id, child_name, embedding }

    Response: best match with confidence
    """
    total_start = time.time()

    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400

    image_b64 = data.get('image')
    stored_embeddings = data.get('embeddings', [])

    if not image_b64:
        return jsonify({"error": "No image provided"}), 400

    if len(stored_embeddings) == 0:
        return jsonify({"error": "No stored embeddings provided for matching"}), 400

    # Decode image
    t = time.time()
    img = decode_base64_image(image_b64)
    print(f"[TIMING] Image decode: {(time.time() - t)*1000:.0f}ms")

    if img is None:
        return jsonify({"error": "Failed to decode image"}), 400

    # Preprocess
    t = time.time()
    img = preprocess_image(img)
    print(f"[TIMING] Preprocess: {(time.time() - t)*1000:.0f}ms")

    # Detect face
    t = time.time()
    faces = extract_face_mtcnn(img)
    print(f"[TIMING] Face detection: {(time.time() - t)*1000:.0f}ms")

    if len(faces) == 0:
        # Fallback: relax threshold to 0.5 and try once more
        faces = extract_face_mtcnn(img, min_confidence=0.5)

        if len(faces) == 0:
            print("[WARN] No face detected even with relaxed threshold.")
            return jsonify({"error": "No face detected. Ensure the face is clearly visible, well-lit, and centred."}), 400

    face_img = faces[0]

    # Generate embedding
    t = time.time()
    query_emb = get_embedding(face_img)
    print(f"[TIMING] Embedding generation: {(time.time() - t)*1000:.0f}ms")

    # Compare against all stored embeddings
    t = time.time()
    best_match = None
    best_confidence = 0.0

    for entry in stored_embeddings:
        stored_emb = base64_to_embedding(entry['embedding'])
        # Normalize stored embedding
        norm = np.linalg.norm(stored_emb)
        if norm > 0:
            stored_emb = stored_emb / norm

        confidence = compute_similarity(query_emb, stored_emb)

        if confidence > best_confidence:
            best_confidence = confidence
            best_match = entry

    print(f"[TIMING] Similarity matching ({len(stored_embeddings)} embeddings): {(time.time() - t)*1000:.0f}ms")

    total_time = (time.time() - total_start) * 1000
    print(f"[TIMING] TOTAL check_user: {total_time:.0f}ms")

    # Build response
    is_match = best_confidence >= CONFIDENCE_THRESHOLD
    sample_b64 = image_to_base64(face_img)

    if is_match and best_match:
        return jsonify({
            "child_id": best_match.get('child_id'),
            "child_name": best_match.get('child_name', 'Unknown'),
            "confidence": round(best_confidence, 2),
            "is_match": True,
            "sample_base64": sample_b64
        })
    else:
        return jsonify({
            "child_id": None,
            "child_name": "Unknown",
            "confidence": round(best_confidence, 2),
            "is_match": False,
            "sample_base64": sample_b64
        })


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 50)
    print("  Sisuraksha Face Recognition Service")
    print("  Running on http://0.0.0.0:5002")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5002, debug=False)
