# ══════════════════════════════════════════════════════════════
# SISURAKSHA — Phone Detection Module (YOLOv8n)
# IT22610102 | Pinto R.I.S.R | 25-26J-282
#
# Runs YOLOv8n via ultralytics (best.pt) in a BACKGROUND THREAD
# so it never blocks the main MediaPipe face detection loop.
# ══════════════════════════════════════════════════════════════

import os
import time
import threading
import cv2
import numpy as np

from config import (
    PHONE_MODEL_PATH, PHONE_CONF_THRESHOLD,
    PHONE_INPUT_SIZE, PHONE_SKIP_FRAMES, PHONE_CLASS_NAMES,
    PHONE_USE_CLASS_ID, PHONE_PERSIST_FRAMES
)


class PhoneDetector:
    """
    YOLOv8n phone-use detector running in a background thread.
    The main loop feeds frames via detect() and gets instant cached results.
    Actual inference happens asynchronously every Nth frame.
    """

    def __init__(self):
        self._phone_aliases = {"phone", "phone_use", "cell_phone", "mobile_phone"}
        self.model = None
        self.enabled = False
        self.frame_count = 0

        # Thread-safe result sharing
        self._lock = threading.Lock()
        self._result = {
            "phone_detected": False,
            "confidence": 0.0,
            "bbox": None,
            "class_name": "",
            "inference_ms": 0.0,
        }
        self._busy = False          # True while inference is running
        self._pending_frame = None  # frame waiting to be processed
        self._thread = None
        self._stop_event = threading.Event()

        # ── Persistence: keep detection alive for N frames ──
        self._last_positive_result = None   # last result where phone=True
        self._frames_since_detection = 999  # frames since last positive

        self._load_model()

    # ── Model loading ─────────────────────────────────
    def _load_model(self):
        """Load YOLOv8n .pt model via ultralytics."""
        model_path = PHONE_MODEL_PATH

        if not os.path.isfile(model_path):
            print(f"[WARN] Phone model not found at: {model_path}")
            print("       Phone detection DISABLED.")
            return

        try:
            from ultralytics import YOLO
            self.model = YOLO(model_path)
            # Warm up the model with a dummy frame
            dummy = np.zeros((480, 640, 3), dtype=np.uint8)
            self.model.predict(dummy, imgsz=PHONE_INPUT_SIZE, conf=0.5, verbose=False, show=False)
            self.enabled = True
            print(f"[INFO] Phone detector loaded & warmed up: {model_path}")
        except Exception as e:
            print(f"[WARN] Failed to load phone model: {e}")
            print("       Phone detection DISABLED.")

    # ── Background inference ──────────────────────────
    def _inference_worker(self, frame):
        """Run YOLO inference in background thread."""
        try:
            t0 = time.time()

            results = self.model.predict(
                frame,
                imgsz=PHONE_INPUT_SIZE,
                conf=PHONE_CONF_THRESHOLD,
                verbose=False,
                show=False,
            )

            inference_ms = (time.time() - t0) * 1000
            new_result = {
                "phone_detected": False,
                "confidence": 0.0,
                "bbox": None,
                "class_name": "",
                "inference_ms": round(inference_ms, 1),
            }

            if results and len(results[0].boxes) > 0:
                boxes = results[0].boxes
                best_conf = 0.0
                best_phone = None

                for i in range(len(boxes)):
                    cls_id = int(boxes.cls[i].item())
                    conf = float(boxes.conf[i].item())
                    cls_name = str(self.model.names.get(cls_id, "")).lower() if isinstance(self.model.names, dict) else ""
                    class_match = (cls_id == PHONE_USE_CLASS_ID) or (cls_name in self._phone_aliases)
                    if class_match and conf > best_conf:
                        best_conf = conf
                        x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                        best_phone = (int(x1), int(y1), int(x2), int(y2))

                if best_phone is not None:
                    new_result = {
                        "phone_detected": True,
                        "confidence": round(best_conf, 3),
                        "bbox": best_phone,
                        "class_name": PHONE_CLASS_NAMES[PHONE_USE_CLASS_ID],
                        "inference_ms": round(inference_ms, 1),
                    }

            with self._lock:
                self._result = new_result
                if new_result["phone_detected"]:
                    self._last_positive_result = new_result.copy()
                    self._frames_since_detection = 0
                self._busy = False

        except Exception as e:
            print(f"[WARN] Phone inference error: {e}")
            with self._lock:
                self._busy = False

    # ── Public API ────────────────────────────────────
    def detect(self, frame):
        """
        Non-blocking phone detection.
        Queues a frame for background inference every Nth frame.
        Always returns instantly with the latest cached result.
        """
        if not self.enabled:
            return self._result

        self.frame_count += 1

        # Only queue a new inference every Nth frame AND if not already busy
        if self.frame_count % PHONE_SKIP_FRAMES == 0:
            with self._lock:
                if not self._busy:
                    self._busy = True
                    t = threading.Thread(
                        target=self._inference_worker,
                        args=(frame.copy(),),  # copy frame for thread safety
                        daemon=True,
                    )
                    t.start()

        # ── Persistence logic ─────────────────────────
        with self._lock:
            self._frames_since_detection += 1
            raw = self._result.copy()

        # If raw result says phone, return it directly
        if raw["phone_detected"]:
            return raw

        # Otherwise, if we had a recent detection, keep it alive
        if (self._last_positive_result is not None
                and self._frames_since_detection <= PHONE_PERSIST_FRAMES):
            persisted = self._last_positive_result.copy()
            persisted["inference_ms"] = raw.get("inference_ms", 0.0)
            return persisted

        return raw

    @property
    def last_result(self):
        with self._lock:
            return self._result.copy()

    # ── Drawing helper ────────────────────────────────
    @staticmethod
    def draw_detection(frame, result):
        """Draw bounding box and label if phone detected."""
        if not result["phone_detected"] or result["bbox"] is None:
            return

        x1, y1, x2, y2 = result["bbox"]
        conf = result["confidence"]
        label = f"PHONE {conf:.0%}"

        # Red bounding box
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)

        # Label background
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 6, y1), (0, 0, 255), -1)
        cv2.putText(frame, label, (x1 + 3, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
