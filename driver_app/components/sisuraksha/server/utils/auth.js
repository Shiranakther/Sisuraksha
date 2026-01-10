import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL;


export const createJti = () => crypto.randomBytes(16).toString('hex');

//  Generate Access Token 
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

// Generate Refresh Token 
export const signRefreshToken = (user, jti) => {
    const payload = { 
        userId: user.id,
        jti: jti, 
    };
    return jwt.sign(payload, REFRESH_SECRET, { 
        expiresIn: REFRESH_TTL,
    });
};

//  Set Refresh Cookie 
export const setRefreshCookie = (res, refreshToken) => {
    const isProd = process.env.NODE_ENV === 'production';

    const maxAgeMs = 60 * 60 * 24 * 7 * 1000; 

    // Refresh token is stored in an HTTP-only, secure cookie
    res.cookie('refresh_token', refreshToken, {
        httpOnly: true, // Prevents client-side JavaScript access 
        secure: isProd, // Only send over HTTPS in production
        sameSite: 'strict', // Protects against CSRF
        path: '/api/auth/refresh', // Restrict cookie to refresh endpoint
        maxAge: maxAgeMs, 
    });
};

//  Hashing the token before DB storage (Highly Recommended)
export const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};