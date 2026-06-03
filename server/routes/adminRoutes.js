import express from 'express';
import { getAllUsers, getAllVehicles, toggleVehicleStatus } from '../controllers/adminController.js';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';

const router = express.Router();

router.get('/users', authenticateToken, authorizeRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]), getAllUsers);
router.get('/vehicles', authenticateToken, authorizeRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]), getAllVehicles);
router.patch('/vehicles/:id/status', authenticateToken, authorizeRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]), toggleVehicleStatus);

export default router;
