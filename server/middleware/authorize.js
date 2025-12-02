
import { ROLES } from '../config/roles.js';

export const authorizeRole = (allowedRoles) => {
    return (req, res, next) => {
        // Assumes req.user has been populated by the authenticateToken middleware
        const userRole = req.user.role; 

        if (!userRole) {
            // Should not happen if authenticateToken runs first, but a safeguard
            return res.status(403).json({ message: 'Forbidden. Role not identified.' });
        }

        // Check if the user's role is in the list of allowed roles
        if (allowedRoles.includes(userRole)) {
            next();
        } else {
            // Role not authorized for this resource
            return res.status(403).json({ 
                message: `Forbidden. Role '${userRole}' cannot access this resource.`,
            });
        }
    };
};