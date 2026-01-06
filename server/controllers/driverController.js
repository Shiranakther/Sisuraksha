import { pool as pgPool } from '../config/postgres.js';
import axios from 'axios';
import AppError from '../utils/appError.js'; 

export const registerDriverProfile = async (req, res, next) => {
    const { 
        user_id, 
        license_number, 
        trip_start_latitude, 
        trip_start_longitude, 
        trip_end_latitude, 
        trip_end_longitude,
        school_ids 
    } = req.body;

    if (!user_id || !license_number || !trip_start_latitude || !trip_start_longitude) {
        return next(new AppError('Missing required registration fields', 400));
    }

    const client = await pgPool.connect();

    try {
        await client.query('BEGIN');

        // Generate Polyline via OSRM 
        let routePolyline;
        try {
            const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${trip_start_longitude},${trip_start_latitude};${trip_end_longitude},${trip_end_latitude}?overview=full&geometries=geojson`;
            const osrmRes = await axios.get(osrmUrl, { timeout: 5000 });
            routePolyline = osrmRes.data.routes[0].geometry.coordinates;
        } catch (err) {
            return next(new AppError('Failed to fetch road route from OSRM', 503));
        }

        // Insert into Driver table
        const driverResult = await client.query(`
            INSERT INTO public.driver (
                user_id, license_number, trip_start_latitude, trip_start_longitude, 
                trip_end_latitude, trip_end_longitude, route_polyline
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [user_id, license_number, trip_start_latitude, trip_start_longitude, trip_end_latitude, trip_end_longitude, JSON.stringify(routePolyline)]);

        const driverId = driverResult.rows[0].id;

        // Insert multiple schools into driver_schools junction table
        if (school_ids && school_ids.length > 0) {
            const schoolValues = school_ids.map((sId, index) => `('${driverId}', '${sId}', ${index + 1})`).join(',');
            await client.query(`
                INSERT INTO public.driver_schools (driver_id, school_id, visit_order)
                VALUES ${schoolValues}
            `);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, driverId });

    } catch (error) {
        await client.query('ROLLBACK');
        next(new AppError(error.message, 500));
    } finally {
        client.release();
    }
};



export const getAssignedChildren = async (req, res, next) => {
    const userId = req.user.id; // Logged in Driver's User ID

    try {
        // 1. Get Driver ID first
        const driverRes = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
        
        if (driverRes.rowCount === 0) {
            return next(new AppError('Driver profile not found.', 404));
        }
        const driverId = driverRes.rows[0].id;

        // 2. Fetch Children with Parent Info, Location, and School
        const query = `
            SELECT 
                c.id AS child_id,
                c.child_name,
                c.card_id,
                s.school_name,
                u.first_name AS parent_first_name,
                u.last_name AS parent_last_name,
                m.phone_number AS parent_phone,
                l.address AS pickup_address,
                l.latitude AS pickup_lat,
                l.longitude AS pickup_lon
            FROM public.children c
            JOIN public.school s ON c.school_id = s.id
            JOIN public.parent p ON c.parent_id = p.id
            JOIN public.users u ON p.user_id = u.id
            LEFT JOIN public.mobile m ON u.id = m.user_id AND m.is_primary = true
            LEFT JOIN public.location l ON u.id = l.user_id
            WHERE c.assigned_driver_id = $1
            ORDER BY s.school_name ASC
        `;

        const result = await pgPool.query(query, [driverId]);

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        next(new AppError('Database error fetching children', 500));
    }
};



export const getDriverAttendance = async (req, res, next) => {
    const userId = req.user.id; 
    const { date, search, limit = 50 } = req.query;

    try {
        // 1. Get Driver ID
        const driverRes = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
        if (driverRes.rowCount === 0) return next(new AppError('Driver not found', 404));
        const driverId = driverRes.rows[0].id;

        // 2. Build Query
        let query = `
            SELECT 
                a.id AS attendance_id,
                c.child_name,
                c.id AS child_id,
                a.date,
                a.status AS is_present,
                a.morning_pickup_time,
                a.morning_drop_time,
                a.evening_pickup_time,
                a.evening_drop_time,
                s.school_name
            FROM public.attendance a
            JOIN public.children c ON a.child_id = c.id
            LEFT JOIN public.school s ON c.school_id = s.id
            WHERE c.assigned_driver_id = $1
        `;

        const params = [driverId];
        let paramCount = 1;

        // 3. Filter by Date (Default to TODAY if not provided, to keep list relevant)
        if (date) {
            paramCount++;
            query += ` AND a.date = $${paramCount}`;
            params.push(date);
        }

        // 4. Search by Student Name
        if (search) {
            paramCount++;
            query += ` AND c.child_name ILIKE $${paramCount}`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY a.created_at DESC LIMIT $${paramCount + 1}`;
        params.push(limit);

        const result = await pgPool.query(query, params);

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        next(new AppError('Database error fetching driver attendance', 500));
    }
};



export const getAttendanceAlerts = async (req, res, next) => {
    const userId = req.user.id;

    try {
        // 1. Get Driver ID
        const driverRes = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
        if (driverRes.rowCount === 0) return next(new AppError('Driver not found', 404));
        const driverId = driverRes.rows[0].id;

        // 2. Find Missing Students (Error Alert)
        // Logic: Get all children assigned to THIS driver -> LEFT JOIN today's attendance -> Filter where attendance is NULL
        const query = `
            SELECT 
                c.id AS child_id,
                c.child_name,
                s.school_name,
                m.phone_number AS parent_phone,
                u.first_name AS parent_name
            FROM public.children c
            JOIN public.school s ON c.school_id = s.id
            JOIN public.parent p ON c.parent_id = p.id
            JOIN public.users u ON p.user_id = u.id
            LEFT JOIN public.mobile m ON u.id = m.user_id AND m.is_primary = true
            LEFT JOIN public.attendance a ON c.id = a.child_id AND a.date = CURRENT_DATE
            WHERE c.assigned_driver_id = $1 
            AND a.id IS NULL -- 👈 This finds students who HAVE NOT scanned today
            ORDER BY s.school_name ASC
        `;

        const result = await pgPool.query(query, [driverId]);

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows,
            message: result.rowCount > 0 ? `Alert: ${result.rowCount} students missing!` : 'All students accounted for.'
        });

    } catch (error) {
        next(new AppError('Database error generating alerts', 500));
    }
};