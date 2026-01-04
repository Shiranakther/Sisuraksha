import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';
import { registerDriverProfile } from '../controllers/driverController.js'; // Import the controller logic

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

export default router;