import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';

// Get Driver Profile
export const getDriverProfile = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const query = `
            SELECT 
                u.id as user_id, 
                u.email, 
                u.first_name, 
                u.last_name, 
                u.role, 
                u.address, 
                u.created_at,
                d.id as driver_id,
                d.license_number,
                v.vehicle_number 
            FROM users u
            LEFT JOIN driver d ON u.id = d.user_id
            LEFT JOIN vehicles v ON d.id = v.driver_id
            WHERE u.id = $1
        `;

        const result = await pgPool.query(query, [userId]);

        if (result.rowCount === 0) {
            return next(new AppError('User not found.', 404));
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });
    } catch (err) {
        next(err);
    }
};

// Update Driver Profile
export const updateDriverProfile = async (req, res, next) => {
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        const userId = req.user.id;
        const { first_name, last_name, address, license_number } = req.body;

        if (!first_name || !last_name) {
            throw new AppError('First and last name are required.', 400);
        }

        // 1. Update general user info
        const userResult = await client.query(
            `
            UPDATE users 
            SET first_name = $1, last_name = $2, address = $3
            WHERE id = $4
            RETURNING id, email, first_name, last_name, role, address
            `,
            [first_name, last_name, address, userId]
        );

        if (userResult.rowCount === 0) {
            throw new AppError('User not found.', 404);
        }

        // 2. Update driver specific info (if license provided)
        let driverResult = null;
        if (license_number) {
            driverResult = await client.query(
                `
                UPDATE driver 
                SET license_number = $1
                WHERE user_id = $2
                RETURNING license_number
                `,
                [license_number, userId]
            );
        }

        await client.query('COMMIT');

        res.status(200).json({
            status: 'success',
            message: 'Driver profile updated successfully.',
            data: {
                ...userResult.rows[0],
                license_number: driverResult?.rows?.[0]?.license_number || undefined
            }
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
};

// Delete Driver Profile
export const deleteDriverProfile = async (req, res, next) => {
    const client = await pgPool.connect();
    try {
        await client.query('BEGIN');
        const userId = req.user.id;

        // Note: Make sure constraints like ON DELETE CASCADE are set for foreign keys 
        // to `users.id` in `driver` and `refresh_tokens`. 
        await client.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

        // Delete user (Cascades should handle linked driver table)
        const result = await client.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('User not found.', 404));
        }

        await client.query('COMMIT');

        // Clear auth cookie
        res.clearCookie('refresh_token');

        res.status(200).json({
            status: 'success',
            message: 'Driver profile deleted successfully.'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
};
