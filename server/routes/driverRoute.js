import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRole } from '../middleware/authorize.js';
import { ROLES } from '../config/roles.js';
import { registerDriverProfile, getAssignedChildren, getDriverAttendance, getAttendanceAlerts, getTodayParentRequests, getTodayTripData, createTrip, getActiveTrip, getBoardingStatus, markChildBoarded, notifyProximity, getOptimizedRoute, markBoardedOptimizedRoute } from '../controllers/driverController.js';
import { getDriverProfile, updateDriverProfile, deleteDriverProfile } from '../controllers/driverProfileController.js';
import { getDriverVehicle, createDriverVehicle, updateDriverVehicle, deleteDriverVehicle } from '../controllers/vehicleController.js';

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

// --- DRIVER PROFILE ROUTES ---
router.get(
    '/profile',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    getDriverProfile
);

router.put(
    '/profile',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    updateDriverProfile
);

router.delete(
    '/profile',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    deleteDriverProfile
);

// --- VEHICLE ROUTES ---
router.get(
    '/vehicle',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    getDriverVehicle
);

router.post(
    '/vehicle',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    createDriverVehicle
);

router.put(
    '/vehicle',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    updateDriverVehicle
);

router.delete(
    '/vehicle',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    deleteDriverVehicle
);

// --- Trip / Route Management Routes ---
router.get(
    '/trip/requests',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    getTodayParentRequests
);

router.get(
    '/trip/today',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    getTodayTripData
);

router.post(
    '/trip/create',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    createTrip
);
router.get(
    '/trip/active',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    getActiveTrip
);

router.get(
    '/trip/:tripId/boarding',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    getBoardingStatus
);

router.post(
    '/trip/:tripId/child/:childId/board',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    markChildBoarded
);

router.post(
    '/trip/notify-proximity/:childId',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    notifyProximity
);

// --- Optimized Route (ADDR) Endpoints ---
router.get(
    '/route/optimized',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    getOptimizedRoute
);

router.post(
    '/route/optimized/board/:childId',
    authenticateToken,
    authorizeRole([ROLES.DRIVER]),
    markBoardedOptimizedRoute
);

export default router;
