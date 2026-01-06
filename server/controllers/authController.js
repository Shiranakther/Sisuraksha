
import bcrypt from 'bcryptjs';
import { pool as pgPool } from '../config/postgres.js';
import { signAccessToken, signRefreshToken, setRefreshCookie, createJti, hashToken } from '../utils/auth.js';
import AppError from '../utils/appError.js';
import axios from 'axios';
import { ALL_ROLES } from '../config/roles.js';


const saltRounds = 10;

// export const register = async (req, res, next) => {
//     const { email, password, role, first_name, last_name, address } = req.body;

//     if (!email || !password || !role || !first_name || !last_name) {
//         return next(new AppError('All fields are required.', 400));
//     }

//     // 1. Get a client from the pool to manage the transaction
//     const client = await pgPool.connect();

//     try {
//         await client.query('BEGIN'); // Start Transaction

//         // 2. Hash Password
//         const passwordHash = await bcrypt.hash(password, 10);

//         // 3. Insert User
//         const userResult = await client.query(
//             `INSERT INTO users (email, password_hash, role, first_name, last_name, address) 
//              VALUES ($1, $2, $3, $4, $5, $6) 
//              RETURNING id, email, role, first_name, last_name`,
//             [email, passwordHash, role, first_name, last_name, address]
//         );
//         const user = userResult.rows[0];

//         // 4. If Role is Parent, AUTOMATICALLY create the parent profile
//         if (role === 'Parent') {
//             await client.query(
//                 `INSERT INTO public.parent (user_id) VALUES ($1)`,
//                 [user.id]
//             );
//         }

//         // 5. Commit Transaction
//         await client.query('COMMIT');

//         // 6. Return Success 
//         // Note: We are still NOT returning a token here. The user must login to get a token.
//         res.status(201).json({
//             status: 'success',
//             message: 'Account created successfully. Please log in.',
//             data: user
//         });

//     } catch (error) {
//         await client.query('ROLLBACK'); // Undo everything if error occurs
        
//         if (error.code === '23505') { // Unique violation (e.g., email exists)
//             return next(new AppError('Email already in use', 409));
//         }
//         return next(error);
//     } finally {
//         client.release(); // Release client back to pool
//     }
// };


export const register = async (req, res, next) => {
    // 1. Destructure ALL possible fields (User + Driver)
    const { 
        email, password, role, first_name, last_name, address, // User fields
        license_number, trip_start_lat, trip_start_lon, trip_end_lat, trip_end_lon, school_ids // Driver fields
    } = req.body;

    if (!email || !password || !role || !first_name || !last_name) {
        return next(new AppError('Basic fields (Name, Email, Password) are required.', 400));
    }

    const client = await pgPool.connect();

    try {
        await client.query('BEGIN'); // Start Transaction

        // --- A. Create User ---
        const passwordHash = await bcrypt.hash(password, 10);
        const userResult = await client.query(
            `INSERT INTO users (email, password_hash, role, first_name, last_name, address) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING id, email, role, first_name, last_name`,
            [email, passwordHash, role, first_name, last_name, address]
        );
        const user = userResult.rows[0];

        // --- B. Handle PARENT Role ---
        if (role === 'Parent') {
            await client.query('INSERT INTO public.parent (user_id) VALUES ($1)', [user.id]);
        }

        // --- C. Handle DRIVER Role (The logic you asked for) ---
        if (role === 'Driver') {
            // 1. Validate Driver Fields
            if (!license_number || !trip_start_lat || !trip_start_lon || !trip_end_lat || !trip_end_lon) {
                throw new AppError('Driver requires: License, Start Location, and End Location.', 400);
            }

            // 2. Calculate Polyline via OSRM
            let routePolyline = null;
            try {
                const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${trip_start_lon},${trip_start_lat};${trip_end_lon},${trip_end_lat}?overview=full&geometries=geojson`;
                const osrmRes = await axios.get(osrmUrl, { timeout: 5000 });
                routePolyline = osrmRes.data.routes[0].geometry.coordinates;
            } catch (err) {
                console.error("OSRM Error:", err.message);
                // Optional: Decide if you want to fail registration or just insert without route
                // For now, we allow it but log the error.
            }

            // 3. Insert Driver Profile
            const driverResult = await client.query(`
                INSERT INTO public.driver (
                    user_id, license_number, trip_start_latitude, trip_start_longitude, 
                    trip_end_latitude, trip_end_longitude, route_polyline
                ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
            `, [user.id, license_number, trip_start_lat, trip_start_lon, trip_end_lat, trip_end_lon, JSON.stringify(routePolyline)]);

            const driverId = driverResult.rows[0].id;

            // 4. Link Schools (if provided)
            if (school_ids && school_ids.length > 0) {
                const schoolValues = school_ids.map((sId, index) => `('${driverId}', '${sId}', ${index + 1})`).join(',');
                await client.query(`
                    INSERT INTO public.driver_schools (driver_id, school_id, visit_order)
                    VALUES ${schoolValues}
                `);
            }
        }

        await client.query('COMMIT');

        res.status(201).json({
            status: 'success',
            message: 'Account created successfully. Please log in.',
            data: user
        });

    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') return next(new AppError('Email already in use', 409));
        return next(error); // Pass custom AppErrors up
    } finally {
        client.release();
    }
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