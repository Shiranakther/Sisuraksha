import express from 'express';
import {
  receiveHeartbeat,
  getSystemStatus,
  toggleSystem,
  startModel,
  stopModel,
  getModelStatus,
  createAlert,
  getAlerts,
  getCriticalAlerts,
  getStats
} from '../controllers/safetyController.js';

const router = express.Router();

// Heartbeat & Status
router.post('/heartbeat', receiveHeartbeat);
router.get('/status', getSystemStatus);
router.post('/toggle', toggleSystem);

// Model Control (start/stop Python process)
router.post('/model/start', startModel);
router.post('/model/stop', stopModel);
router.get('/model/status', getModelStatus);

// Alerts
router.post('/alerts', createAlert);
router.get('/alerts', getAlerts);
router.get('/alerts/critical', getCriticalAlerts);

// Stats
router.get('/stats', getStats);

export default router;
