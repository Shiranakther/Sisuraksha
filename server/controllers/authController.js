
import bcrypt from 'bcryptjs';
import { pool as pgPool } from '../config/postgres.js';
import { signAccessToken, signRefreshToken, setRefreshCookie, createJti, hashToken } from '../utils/auth.js';
import AppError from '../utils/appError.js';
import { ALL_ROLES } from '../config/roles.js';


const saltRounds = 10;

// user register
export const register = async (req, res, next) => {
    const { email, password, role } = req.body;
    
    
    if (!email || !password || !role) {
        return next(new AppError('Email, password, and role are required.', 400));
    }
    if (!ALL_ROLES.includes(role)) {
        return next(new AppError(`Invalid role specified: ${role}.`, 400));
    }

    
    const passwordHash = await bcrypt.hash(password, saltRounds);

    
    // Insert user into Supabase 'users' table
    const result = await pgPool.query(
        `INSERT INTO users (email, password_hash, role) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, role`,
        [email, passwordHash, role]
    );
    
    const user = result.rows[0];

    
    res.status(201).json({ 
        status: 'success', 
        message: 'User registered successfully. Please log in.',
        data: { id: user.id, email: user.email, role: user.role }
    });
};


//User login

export const login = async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(new AppError('Email and password are required.', 400));
    }

    // Find user by email
    const userResult = await pgPool.query(
        'SELECT id, email, password_hash, role FROM users WHERE email = $1 AND is_active = TRUE',
        [email]
    );

    const user = userResult.rows[0];
    if (!user) {
        
        return next(new AppError('Invalid credentials. User not found', 401)); 
    }

    // Validate credentials
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
        return next(new AppError('Wrong Password ', 401));
    }

    // Generate tokens 
    const jti = createJti();
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user, jti);
    
    // Store refresh token hash in DB for revocation 
    const hashedToken = hashToken(refreshToken);
    await pgPool.query(
  'INSERT INTO refresh_tokens (user_id, token_hash, jti, expires_at) VALUES ($1, $2, $3, NOW() + $4::interval)',
          [user.id, hashedToken, jti, process.env.REFRESH_TOKEN_TTL] 
    );

    // Send tokens to client 
    setRefreshCookie(res, refreshToken);
    
    res.status(200).json({
        status: 'success',
        message: 'Login successful.',
        token: accessToken, 
        data: { userId: user.id, role: user.role }
    });
};


//logout

export const logout = async (req, res, next) => {
    // The refresh token is gets from the cookie
    const refreshToken = req.cookies.refresh_token; 

    if (!refreshToken) {
        return res.status(200).json({ status: 'success', message: 'Logged out (no active refresh token).' });
    }

    // Hash the token for DB lookup
    const hashedToken = hashToken(refreshToken);

    // Revoke the refresh token from the database (Step 8)
    // Set revoked_at to NOW() to invalidate it
    await pgPool.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
        [hashedToken]
    );
    
    // Clear the cookie on the client (Step 8)
    res.clearCookie('refresh_token');

    res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
};

// Refresh token 

export const refresh = async (req, res, next) => {
    // The refresh token is retrieved from the HTTP-only cookie
    const refreshToken = req.cookies.refresh_token; 

    if (!refreshToken) {
        return next(new AppError('Unauthorized: Refresh token missing.', 401));
    }

    // (clearing the cookie) that must happen immediately upon JWT failure.
    try {
        //  Verify refresh token signature
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const jti = decoded.jti; // Get the unique JWT ID

        //  Lookup the token in the database (Step 7)
        const hashedToken = hashToken(refreshToken);
        const dbTokenResult = await pgPool.query(
            'SELECT user_id, revoked_at, expires_at FROM refresh_tokens WHERE jti = $1 AND token_hash = $2',
            [jti, hashedToken]
        );

        const dbToken = dbTokenResult.rows[0];

        //  Check for token existence, revocation, and expiration
        if (!dbToken || dbToken.revoked_at || new Date() > dbToken.expires_at) {
            // Revoke the token family if rotation fails or is compromised
            await pgPool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1', [decoded.userId]);
            res.clearCookie('refresh_token');
            return next(new AppError('Forbidden: Invalid or expired refresh token.', 403));
        }

        //  Generate new tokens (Token Rotation)
        const user = { id: decoded.userId, role: dbToken.role }; // Fetch user role from DB if needed, simplified here
        const newAccessToken = signAccessToken(user);
        const newJti = createJti();
        const newRefreshToken = signRefreshToken(user, newJti);

        //  Revoke old token and save new token hash
        await pgPool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE jti = $1', [jti]);
        await pgPool.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, jti, expires_at) VALUES ($1, $2, $3, NOW() + interval $4)',
            [user.id, hashToken(newRefreshToken), newJti, process.env.REFRESH_TOKEN_TTL]
        );

        //  Set new cookie and send new access token
        setRefreshCookie(res, newRefreshToken);

        res.status(200).json({
            status: 'success',
            message: 'Token refreshed successfully.',
            token: newAccessToken,
        });

    } catch (err) {
        // JWT verification failure 
        res.clearCookie('refresh_token');
        // Pass the error to the global handler as a specific AppError
        return next(new AppError('Unauthorized: Refresh token invalid.', 401)); 
    }
};