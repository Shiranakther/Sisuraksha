import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';

const router = express.Router();

// --- Test 1: High-Level Access (SuperAdmin or CompanyAdmin Only) ---
// Purpose: Check if roles 'Parent', 'Driver', or 'Student' are successfully blocked (403 Forbidden).
router.get(
    '/test/admin-dashboard',
    authenticateToken,
    authorizeRole([ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN]),
    (req, res) => {
        // This code only runs if the token is valid AND the role is SuperAdmin or CompanyAdmin.
        res.status(200).json({
            status: 'success',
            message: 'ACCESS GRANTED: Welcome to the Admin Dashboard!',
            user: req.user // Shows the extracted user ID and Role
        });
    }
);

// --- Test 2: Standard User Access (Parent, Driver, or Admin) ---
// Purpose: Check if a basic user role (Parent/Driver) can pass, while unauthorized roles (like 'Student') might be restricted.
router.get(
    '/test/standard-access',
    authenticateToken,
    authorizeRole([ROLES.PARENT, ROLES.DRIVER, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN]),
    (req, res) => {
        res.status(200).json({
            status: 'success',
            message: 'ACCESS GRANTED: This is a standard route visible to most users.',
            user: req.user
        });
    }
);

// --- Test 3: Authentication Check Only (No Role Restriction) ---
// Purpose: Check if the token is merely valid (any authenticated user can access).
router.get(
    '/test/auth-only',
    authenticateToken,
    (req, res) => {
        res.status(200).json({
            status: 'success',
            message: 'AUTHENTICATION GRANTED: Token is valid.',
            user: req.user
        });
    }
);

export default router;