import jwt from 'jsonwebtoken';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

export const authenticateToken = (req, res, next) => {
    // 1. Get token from Authorization header (Step 5)
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Expects 'Bearer <token>'

    if (!token) {
        return res.status(401).json({ message: 'Access Denied. No token provided.' });
    }

    try {
        //  Validate access token (Step 6)
        const decoded = jwt.verify(token, ACCESS_SECRET);
        
        // Attach user info to the request for the next middleware/route handler
        req.user = {
            id: decoded.userId,
            role: decoded.role,
        };
        next();
    } catch (err) {
        // If token expired or invalid signature
        return res.status(401).json({ message: 'Invalid or expired Access Token.' });
    }
};