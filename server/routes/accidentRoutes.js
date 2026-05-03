import express from 'express';
import {
  receiveAlert,
  cancelAlert,
  cancelActiveAlertFromApp,
  receiveLiveState,
  getLiveState,
  getDeviceCommand,
  getActiveAlerts,
  getAlertHistory,
  getDoorStatus,
  resetDoorFromApp,
  doorCallback,
} from '../controllers/accidentController.js';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';

const router = express.Router();

// ESP32 endpoints (no auth — device posts directly)
router.post('/alert', receiveAlert);
router.post('/cancel', cancelAlert);
router.post('/live-state', receiveLiveState);
router.get('/command', getDeviceCommand);
router.post('/door-callback', doorCallback);

// App endpoints (JWT auth)
router.get(
  '/active',
  authenticateToken,
  authorizeRole([ROLES.PARENT, ROLES.DRIVER, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]),
  getActiveAlerts
);
router.get(
  '/live-state',
  authenticateToken,
  authorizeRole([ROLES.PARENT, ROLES.DRIVER, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]),
  getLiveState
);
router.post(
  '/cancel-active',
  authenticateToken,
  authorizeRole([ROLES.DRIVER, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]),
  cancelActiveAlertFromApp
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

router.post(
  '/door-reset',
  authenticateToken,
  authorizeRole([ROLES.DRIVER, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]),
  resetDoorFromApp
);

export default router;
