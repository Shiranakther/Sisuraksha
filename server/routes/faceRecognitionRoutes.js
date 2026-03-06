import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';
import multer from 'multer';
import {
  registerFace,
  verifyFace,
  getRegistrationStatus,
  deleteEmbeddings,
  startFlaskService,
  stopFlaskService,
  getServiceStatus
} from '../controllers/faceRecognitionController.js';

const router = express.Router();

// Multer config: store in memory, max 5MB per file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── Face Registration (Parent) ─────────────────────────────────────────────

router.post(
  '/register',
  authenticateToken,
  authorizeRole([ROLES.PARENT]),
  upload.array('images', 3),
  registerFace
);

router.get(
  '/status/:childId',
  authenticateToken,
  getRegistrationStatus
);

router.delete(
  '/register/:childId',
  authenticateToken,
  authorizeRole([ROLES.PARENT]),
  deleteEmbeddings
);

// ─── Face Verification (Driver) ─────────────────────────────────────────────

router.post(
  '/verify',
  authenticateToken,
  authorizeRole([ROLES.DRIVER, ROLES.PARENT]),
  verifyFace
);

// ─── Flask Service Management (Admin) ───────────────────────────────────────

router.post(
  '/service/start',
  authenticateToken,
  authorizeRole([ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN]),
  startFlaskService
);

router.post(
  '/service/stop',
  authenticateToken,
  authorizeRole([ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN]),
  stopFlaskService
);

router.get(
  '/service/status',
  authenticateToken,
  getServiceStatus
);

export default router;
