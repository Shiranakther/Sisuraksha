import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';

import {
    findNearestRoutes,
    assignDriverToChild
} from '../controllers/assignController.js';

const router = express.Router();


router.post(
    '/nearest-routes',
    authenticateToken,
    authorizeRole([
        ROLES.PARENT,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    findNearestRoutes
);


router.post(
    '/assign-driver',
    authenticateToken,
    authorizeRole([
        ROLES.PARENT,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    assignDriverToChild
);

export default router;
