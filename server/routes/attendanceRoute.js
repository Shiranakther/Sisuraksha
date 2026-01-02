import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';
import { triggerRegistration,syncIoTDevice } from '../controllers/attendanceController.js';

const router = express.Router();

router.post(
    '/sync',syncIoTDevice
);

router.post(
    '/register-trigger',
    authenticateToken,
    authorizeRole([
        ROLES.DRIVER,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    triggerRegistration
);

export default router;
