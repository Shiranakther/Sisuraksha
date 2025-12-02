// utils/auth.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// 💡 Best Practice: Use the built-in node:crypto for generating secure tokens and hashes
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL;

// Helper to generate a unique JWT ID (JTI) for token tracking/rotation
export const createJti = () => crypto.randomBytes(16).toString('hex');

// 1. Generate Access Token (Step 3)
export const signAccessToken = (user) => {
    // Payload includes: userId, role, issuedAt, expiresAt (iat and exp are automatically added)
    const payload = { 
        userId: user.id, 
        role: user.role, 
    };
    return jwt.sign(payload, ACCESS_SECRET, { 
        expiresIn: process.env.ACCESS_TOKEN_TTL,
    });
};

// 2. Generate Refresh Token (Step 4)
export const signRefreshToken = (user, jti) => {
    const payload = { 
        userId: user.id,
        jti: jti, // Crucial for database lookups and rotation
    };
    return jwt.sign(payload, REFRESH_SECRET, { 
        expiresIn: REFRESH_TTL,
    });
};

// 3. Set Refresh Cookie (Step 5)
export const setRefreshCookie = (res, refreshToken) => {
    const isProd = process.env.NODE_ENV === 'production';
    // Max Age calculation: Parse the REFRESH_TTL (e.g., '7d') into milliseconds
    // Simplified approximation for common cases (7 days = 604800000ms)
    const maxAgeMs = 60 * 60 * 24 * 7 * 1000; // Example: 7 days in milliseconds

    // Refresh token is stored in an HTTP-only, secure cookie
    res.cookie('refresh_token', refreshToken, {
        httpOnly: true, // Prevents client-side JavaScript access (mitigates XSS)
        secure: isProd, // Only send over HTTPS in production
        sameSite: 'strict', // Protects against CSRF
        path: '/api/auth/refresh', // Restrict cookie to refresh endpoint
        maxAge: maxAgeMs, 
    });
};

// 4. Hashing the token before DB storage (Highly Recommended)
export const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};