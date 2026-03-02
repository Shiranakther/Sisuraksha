import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';

import {
    upsertLocation,
    getMyLocation,
    addPhoneNumber,
    getMyPhoneNumbers,
    deletePhoneNumber,
    getProfile,
    updateProfile,
    deleteProfile
} from '../controllers/profileController.js';

const router = express.Router();

// --- Profile Routes ---
router.get(
    '/',
    authenticateToken,
    getProfile
);

router.put(
    '/',
    authenticateToken,
    updateProfile
);

router.delete(
    '/',
    authenticateToken,
    deleteProfile
);

// Create or Update Location
router.post(
    '/location',
    authenticateToken,
    authorizeRole([
        ROLES.PARENT,
        ROLES.DRIVER,
        ROLES.STUDENT,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    upsertLocation
);

// Get My Location
router.get(
    '/location',
    authenticateToken,
    authorizeRole([
        ROLES.PARENT,
        ROLES.DRIVER,
        ROLES.STUDENT,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    getMyLocation
);

// Add phone number
router.post(
    '/mobile',
    authenticateToken,
    authorizeRole([
        ROLES.PARENT,
        ROLES.DRIVER,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    addPhoneNumber
);

// Get my phone numbers
router.get(
    '/mobile',
    authenticateToken,
    authorizeRole([
        ROLES.PARENT,
        ROLES.DRIVER,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    getMyPhoneNumbers
);

// Delete phone number
router.delete(
    '/mobile/:phoneId',
    authenticateToken,
    authorizeRole([
        ROLES.PARENT,
        ROLES.DRIVER,
        ROLES.COMPANY_ADMIN,
        ROLES.SUPER_ADMIN
    ]),
    deletePhoneNumber
);

export default router;
