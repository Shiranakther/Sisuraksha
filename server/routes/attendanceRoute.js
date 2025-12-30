import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';

import {
    markAttendanceByCard,
    getChildAttendanceByDate
} from '../controllers/attendanceController.js';

const router = express.Router();

router.post(
    '/mark',
    authenticateToken,
    authorizeRole([
        ROLES.DRIVER,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    markAttendanceByCard
);


router.get(
    '/child/:childId',
    authenticateToken,
    authorizeRole([
        ROLES.PARENT,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    getChildAttendanceByDate
);

export default router;
