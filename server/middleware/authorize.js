
import { ROLES } from '../config/roles.js';

export const authorizeRole = (allowedRoles) => {
    return (req, res, next) => {
        
        const userRole = req.user.role; 

        if (!userRole) {
            
            return res.status(403).json({ message: 'Forbidden. Role not identified.' });
        }

        
        if (allowedRoles.includes(userRole)) {
            next();
        } else {
            
            return res.status(403).json({ 
                message: `Forbidden. Role '${userRole}' cannot access this resource.`,
            });
        }
    };
};