import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';
import { registerParentProfile,registerChild, getSchoolsForDropdown,getMyChildren,getParentAttendance } from '../controllers/parentController.js'; // Import the controller we created

const router = express.Router();

// --- Parent Profile Creation ---
router.post(
    '/parent_register',
    authenticateToken,
    authorizeRole([ROLES.PARENT, ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN]), // Optional: Uncomment if you want to restrict who can create a profile
    registerParentProfile
);


router.get(
    '/dashboard',
    authenticateToken,
    authorizeRole([ROLES.PARENT]),
    (req, res) => {
        res.status(200).json({
            status: 'success',
            message: 'Welcome to the Parent Dashboard',
            user: req.user
        });
    }
);


router.get(
    '/schools',
    // authenticateToken,
    getSchoolsForDropdown
);

// --- Register Child ---

router.post(
    '/register_child',
    authenticateToken,
    // authorizeRole([ROLES.PARENT]), 
    registerChild
);


router.get(
    '/my-children',
    authenticateToken,
    authorizeRole([ROLES.PARENT]), 
    getMyChildren
);

router.get(
    '/my-attendance',
    authenticateToken,
    authorizeRole([ROLES.PARENT]), // Only parents can access
    getParentAttendance
);

export default router;