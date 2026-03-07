import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';

// ==========================================
// Get Driver's Vehicle
// ==========================================
export const getDriverVehicle = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // 1. Get Driver ID from logged-in user
        const driverRes = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
        if (driverRes.rowCount === 0) {
            return next(new AppError('Driver profile not found.', 404));
        }
        const driverId = driverRes.rows[0].id;

        // 2. Get the vehicle linked to this driver
        const result = await pgPool.query(
            `SELECT id, vehicle_number, capacity, is_active, is_verified, created_at
             FROM public.vehicles
             WHERE driver_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [driverId]
        );

        if (result.rowCount === 0) {
            return res.status(200).json({
                status: 'success',
                data: null,
                message: 'No vehicle registered yet.'
            });
        }

        res.status(200).json({
            status: 'success',
            data: result.rows[0]
        });

    } catch (err) {
        next(new AppError('Database error fetching vehicle', 500));
    }
};

// ==========================================
// Create / Register a Vehicle for the Driver
// ==========================================
export const createDriverVehicle = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { vehicle_number, capacity } = req.body;

        if (!vehicle_number) {
            return next(new AppError('Vehicle number is required.', 400));
        }

        // 1. Get Driver ID
        const driverRes = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
        if (driverRes.rowCount === 0) {
            return next(new AppError('Driver profile not found.', 404));
        }
        const driverId = driverRes.rows[0].id;

        // 2. Check if driver already has a vehicle
        const existingVehicle = await pgPool.query(
            'SELECT id FROM public.vehicles WHERE driver_id = $1',
            [driverId]
        );

        if (existingVehicle.rowCount > 0) {
            return next(new AppError('You already have a vehicle registered. Please update or delete it first.', 409));
        }

        // 3. Insert new vehicle
        const result = await pgPool.query(
            `INSERT INTO public.vehicles (driver_id, vehicle_number, capacity)
             VALUES ($1, $2, $3)
             RETURNING id, vehicle_number, capacity, is_active, is_verified, created_at`,
            [driverId, vehicle_number, capacity || 0]
        );

        res.status(201).json({
            status: 'success',
            message: 'Vehicle registered successfully.',
            data: result.rows[0]
        });

    } catch (err) {
        // Handle unique constraint violation on vehicle_number
        if (err.code === '23505') {
            return next(new AppError('This vehicle number is already registered.', 409));
        }
        next(new AppError('Database error creating vehicle', 500));
    }
};

// ==========================================
// Update Driver's Vehicle
// ==========================================
export const updateDriverVehicle = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { vehicle_number, capacity } = req.body;

        if (!vehicle_number) {
            return next(new AppError('Vehicle number is required.', 400));
        }

        // 1. Get Driver ID
        const driverRes = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
        if (driverRes.rowCount === 0) {
            return next(new AppError('Driver profile not found.', 404));
        }
        const driverId = driverRes.rows[0].id;

        // 2. Update vehicle
        const result = await pgPool.query(
            `UPDATE public.vehicles
             SET vehicle_number = $1, capacity = $2
             WHERE driver_id = $3
             RETURNING id, vehicle_number, capacity, is_active, is_verified, created_at`,
            [vehicle_number, capacity || 0, driverId]
        );

        if (result.rowCount === 0) {
            return next(new AppError('No vehicle found to update. Please register one first.', 404));
        }

        res.status(200).json({
            status: 'success',
            message: 'Vehicle updated successfully.',
            data: result.rows[0]
        });

    } catch (err) {
        if (err.code === '23505') {
            return next(new AppError('This vehicle number is already registered.', 409));
        }
        next(new AppError('Database error updating vehicle', 500));
    }
};

// ==========================================
// Delete Driver's Vehicle
// ==========================================
export const deleteDriverVehicle = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // 1. Get Driver ID
        const driverRes = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
        if (driverRes.rowCount === 0) {
            return next(new AppError('Driver profile not found.', 404));
        }
        const driverId = driverRes.rows[0].id;

        // 2. Delete vehicle
        const result = await pgPool.query(
            'DELETE FROM public.vehicles WHERE driver_id = $1 RETURNING id',
            [driverId]
        );

        if (result.rowCount === 0) {
            return next(new AppError('No vehicle found to delete.', 404));
        }

        res.status(200).json({
            status: 'success',
            message: 'Vehicle deleted successfully.'
        });

    } catch (err) {
        next(new AppError('Database error deleting vehicle', 500));
    }
};
