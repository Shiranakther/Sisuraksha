import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';
import { registerDriverProfile,getAssignedChildren,getDriverAttendance,getAttendanceAlerts } from '../controllers/driverController.js'; // Import the controller logic

const router = express.Router();

// --- Driver Profile Creation ---
// Purpose: Create a driver profile, calculate the route via OSRM, and assign schools.
// Access: Depending on your flow, this allows the User (DRIVER) or Admins to complete the profile.
router.post(
    '/driver_register',
    authenticateToken,
    // authorizeRole([ROLES.DRIVER, ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN]), // Optional: Uncomment to enforce specific roles
    registerDriverProfile
);

// --- Example: Get Driver Dashboard ---
// Purpose: A protected route only for Drivers to view their assigned route/schools.
router.get(
    '/dashboard',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    (req, res) => {
        res.status(200).json({
            status: 'success',
            message: 'Welcome to the Driver Dashboard',
            user: req.user
        });
    }
);


router.get(
    '/my-children',
    authenticateToken, 
    authorizeRole([ROLES.DRIVER]), // Only drivers can see this
    getAssignedChildren
);





router.get(
    '/attendance', 
    authenticateToken, 
    authorizeRole([ROLES.DRIVER]), 
    getDriverAttendance
);



router.get('/alerts', authenticateToken, authorizeRole([ROLES.DRIVER]), getAttendanceAlerts);

export default router;


