import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';

export const getAllUsers = async (req, res, next) => {
    try {
        const query = `
            SELECT 
                u.id AS user_id,
                u.first_name,
                u.last_name,
                u.email,
                u.role,
                u.is_active,
                u.created_at,
                d.license_number,
                d.id AS driver_id,
                p.id AS parent_id,
                m.phone_number,
                l.address,
                l.latitude,
                l.longitude,
                (SELECT COUNT(*) FROM public.children c WHERE c.parent_id = p.id) AS children_count
            FROM public.users u
            LEFT JOIN public.driver d ON u.id = d.user_id
            LEFT JOIN public.parent p ON u.id = p.user_id
            LEFT JOIN public.mobile m ON u.id = m.user_id AND m.is_primary = true
            LEFT JOIN public.location l ON u.id = l.user_id
            WHERE u.role IN ('Driver', 'Parent')
            ORDER BY u.created_at DESC
        `;
        const result = await pgPool.query(query); 

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows
        });
    } catch (error) {
        next(new AppError('Failed fetching all users: ' + error.message, 500));
    }
};

export const getAllVehicles = async (req, res, next) => {
    try {
        const query = `
            SELECT 
                v.id AS vehicle_id,
                v.vehicle_number,
                v.capacity,
                v.is_active,
                v.is_verified,
                v.created_at,
                d.id AS driver_id,
                d.license_number,
                u.first_name AS driver_first_name,
                u.last_name AS driver_last_name,
                u.email AS driver_email,
                m.phone_number AS driver_phone
            FROM public.vehicles v
            JOIN public.driver d ON v.driver_id = d.id
            JOIN public.users u ON d.user_id = u.id
            LEFT JOIN public.mobile m ON u.id = m.user_id AND m.is_primary = true
            ORDER BY v.created_at DESC
        `;
        const result = await pgPool.query(query);

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows
        });
    } catch (error) {
        next(new AppError('Failed fetching all vehicles: ' + error.message, 500));
    }
};

export const toggleVehicleStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { field, value } = req.body;
        
        if (!['is_active', 'is_verified'].includes(field)) {
            return next(new AppError('Invalid field provided. Must be is_active or is_verified.', 400));
        }

        const result = await pgPool.query(
            `UPDATE public.vehicles SET ${field} = $1 WHERE id = $2 RETURNING *`,
            [value, id]
        );

        if (result.rowCount === 0) {
            return next(new AppError('Vehicle not found', 404));
        }

        res.status(200).json({ 
            status: 'success', 
            message: `Vehicle ${field} updated successfully`,
            data: result.rows[0] 
        });
    } catch (error) {
        next(new AppError('Failed updating vehicle status: ' + error.message, 500));
    }
};
