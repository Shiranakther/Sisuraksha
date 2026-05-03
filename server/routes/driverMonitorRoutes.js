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
  getModelStatus,
  calibrateModel,
  retryCalibrationStage,
  getCalibrationStatus
} from '../controllers/driverMonitorController.js';

const router = express.Router();

// Model control
router.post('/model/start', startModel);
router.post('/model/stop', stopModel);
router.get('/model/status', getModelStatus);
router.post('/model/calibrate', calibrateModel);
router.post('/model/calibration/retry', retryCalibrationStage);
router.get('/model/calibration/status', getCalibrationStatus);

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
