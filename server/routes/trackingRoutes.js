import express from 'express';
import {
  postGpsPoint,
  getBusLastLocation,
  getBusPath,
} from '../controllers/trackingController.js';

const router = express.Router();

router.post('/point', postGpsPoint);
router.get('/bus/:busId/last', getBusLastLocation);
router.get('/bus/:busId/path', getBusPath);

export default router;