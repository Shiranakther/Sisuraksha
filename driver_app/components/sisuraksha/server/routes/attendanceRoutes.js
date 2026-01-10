import express from 'express';
import {
  markAttendance,
  getAttendanceByMother,
  getAttendanceByDate,
  deleteAttendance,
  getTodayAttendanceForDriver,
} from '../controllers/attendanceController.js';

const router = express.Router();

// Mark attendance (came to school / came back)
router.post('/mark', markAttendance);

// Get all attendance for a mother
router.get('/mother/:motherId', getAttendanceByMother);

// Get attendance by date (use path params for clarity)
router.get('/mother/:motherId/date/:date', getAttendanceByDate);

// Get today's attendance for driver (all mothers with bus requests)
router.get('/driver/daily', getTodayAttendanceForDriver);

// Delete attendance
router.delete('/:id', deleteAttendance);

export default router;