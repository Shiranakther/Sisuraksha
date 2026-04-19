import express from 'express';
import {
  receiveAlert,
  cancelAlert,
  getActiveAlerts,
  getAlertHistory,
  getDoorStatus,
  doorCallback,
} from '../controllers/accidentController.js';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';

const router = express.Router();

// ESP32 endpoints (no auth — device posts directly)
router.post('/alert', receiveAlert);
router.post('/cancel', cancelAlert);
router.post('/door-callback', doorCallback);

// App endpoints (JWT auth)
router.get(
  '/active',
  authenticateToken,
  authorizeRole([ROLES.PARENT, ROLES.DRIVER, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]),
  getActiveAlerts
);
router.get(
  '/history',
  authenticateToken,
  authorizeRole([ROLES.PARENT, ROLES.DRIVER, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]),
  getAlertHistory
);

router.get(
  '/door-status',
  authenticateToken,
  authorizeRole([ROLES.DRIVER, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]),
  getDoorStatus
);

export default router;
