import express from 'express';
import {
  receiveHeartbeat,
  getSystemStatus,
  toggleSystem,
  createAlert,
  getAlerts,
  getCriticalAlerts,
  getStats,
  startModel,
  stopModel,
  getModelStatus
} from '../controllers/windowSafetyController.js';

const router = express.Router();

// Model control
router.post('/model/start', startModel);
router.post('/model/stop', stopModel);
router.get('/model/status', getModelStatus);

// Heartbeat & Status
router.post('/heartbeat', receiveHeartbeat);
router.get('/status', getSystemStatus);
router.post('/toggle', toggleSystem);

// Alerts
router.post('/alerts', createAlert);
router.get('/alerts', getAlerts);
router.get('/alerts/critical', getCriticalAlerts);

// Stats
router.get('/stats', getStats);

export default router;
