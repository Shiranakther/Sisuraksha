import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';




// Create or Update Location (1 location per user)
export const upsertLocation = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { address, city, latitude, longitude } = req.body;

        if (!address || !city) {
            return next(new AppError('Address and city are required.', 400));
        }

        const result = await pgPool.query(
            `
            INSERT INTO location (user_id, address, city, latitude, longitude)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id)
            DO UPDATE SET
                address = EXCLUDED.address,
                city = EXCLUDED.city,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude
            RETURNING *
            `,
            [userId, address, city, latitude, longitude]
        );

        res.status(200).json({
            status: 'success',
            message: 'Location saved successfully.',
            data: result.rows[0]
        });
    } catch (err) {
        next(err);
    }
};

// Get logged in user location
export const getMyLocation = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await pgPool.query(
            'SELECT * FROM location WHERE user_id = $1',
            [userId]
        );

        res.status(200).json({
            status: 'success',
            data: result.rows[0] || null
        });
    } catch (err) {
        next(err);
    }
};

// Add phone number
export const addPhoneNumber = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { phone_number, is_primary = false } = req.body;

        if (!phone_number) {
            return next(new AppError('Phone number is required.', 400));
        }

        // If primary, unset old primary
        if (is_primary) {
            await pgPool.query(
                'UPDATE mobile SET is_primary = false WHERE user_id = $1',
                [userId]
            );
        }

        const result = await pgPool.query(
            `
            INSERT INTO mobile (user_id, phone_number, is_primary)
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [userId, phone_number, is_primary]
        );

        res.status(201).json({
            status: 'success',
            message: 'Phone number added successfully.',
            data: result.rows[0]
        });
    } catch (err) {
        next(err);
    }
};

// Get all phone numbers of logged-in user
export const getMyPhoneNumbers = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await pgPool.query(
            `
            SELECT *
            FROM mobile
            WHERE user_id = $1
            ORDER BY is_primary DESC, created_at DESC
            `,
            [userId]
        );

        res.status(200).json({
            status: 'success',
            data: result.rows
        });
    } catch (err) {
        next(err);
    }
};

// Delete phone number
export const deletePhoneNumber = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { phoneId } = req.params;

        const result = await pgPool.query(
            'DELETE FROM mobile WHERE id = $1 AND user_id = $2 RETURNING id',
            [phoneId, userId]
        );

        if (result.rowCount === 0) {
            return next(new AppError('Phone number not found.', 404));
        }

        res.status(200).json({
            status: 'success',
            message: 'Phone number deleted successfully.'
        });
    } catch (err) {
        next(err);
    }
};
