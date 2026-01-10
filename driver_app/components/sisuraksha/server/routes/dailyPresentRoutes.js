import express from 'express';
import {
  createDailyPresentRequest,
  getDailyPresentByParent,
  getDailyPresentById,
  getDailyPresentByDate,
  getDailyPresentByChild,
  getTodayPresentBySchool,
  updateDailyPresentRequest,
  deleteDailyPresentRequest,
  deleteDailyPresentByParent,
} from '../controllers/dailyPresentController.js';
import { authenticateToken } from '../middleware/authenticate.js';

const router = express.Router();

// Apply authentication to all routes (optional - remove if not needed)
// router.use(authenticateToken);

/**
 * CREATE Routes
 */
// Create a new daily present request
router.post('/', createDailyPresentRequest);

/**
 * READ Routes
 */
// Get all daily present requests for a specific parent
router.get('/parent/:parentId', getDailyPresentByParent);

// Get daily present requests by parent and date
router.get('/parent/:parentId/date/:date', getDailyPresentByDate);

// Get daily present requests for a specific child
router.get('/child/:childId', getDailyPresentByChild);

// Get today's daily present requests for a specific school
router.get('/school/:schoolId/today', getTodayPresentBySchool);

// Get a specific daily present request by ID
router.get('/:id', getDailyPresentById);

/**
 * UPDATE Routes
 */
// Update a daily present request
router.put('/:id', updateDailyPresentRequest);

/**
 * DELETE Routes
 */
// Delete a specific daily present request
router.delete('/:id', deleteDailyPresentRequest);

// Delete all daily present requests for a parent
router.delete('/parent/:parentId', deleteDailyPresentByParent);

export default router;
