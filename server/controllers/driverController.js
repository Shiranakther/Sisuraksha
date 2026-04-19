import { pool as pgPool } from '../config/postgres.js';
import axios from 'axios';
import AppError from '../utils/appError.js'; 
import fs from 'fs';

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
        fs.appendFileSync('alerts_error.txt', error.stack + '\n');
        next(new AppError('Database error generating alerts', 500));
    }
};

// =====================================================
// DRIVER TRIP / ROUTE MANAGEMENT
// =====================================================

/**
 * GET /driver/trip/requests
 * Returns all parent attendance declarations for today for children assigned to this driver.
 */
export const getTodayParentRequests = async (req, res, next) => {
    const userId = req.user.id;
    try {
        const driverRes = await pgPool.query(
            'SELECT id FROM public.driver WHERE user_id = $1', [userId]
        );
        if (driverRes.rowCount === 0) return next(new AppError('Driver profile not found', 404));
        const driverId = driverRes.rows[0].id;

        const today = new Date().toISOString().split('T')[0];

        const result = await pgPool.query(
            `SELECT
               c.id AS child_id,
               c.child_name,
               u.first_name || ' ' || u.last_name AS parent_name,
               m.phone_number AS parent_phone,
               pas.is_present,
               pas.schedule_type,
               pas.pickup_lat,
               pas.pickup_lon,
               pas.pickup_address,
               pas.dropoff_lat,
               pas.dropoff_lon,
               pas.dropoff_address,
               pas.notes,
               pas.schedule_date
             FROM public.children c
             JOIN public.parent pr ON pr.id = c.parent_id
             JOIN public.users u ON u.id = pr.user_id
             LEFT JOIN public.mobile m ON m.user_id = u.id
             LEFT JOIN public.parent_attendance_schedule pas
               ON pas.child_id = c.id AND pas.schedule_date = $2
             WHERE c.assigned_driver_id = $1
             ORDER BY c.child_name`,
            [driverId, today]
        );

        res.status(200).json({ status: 'success', data: result.rows, date: today });
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};

/**
 * GET /driver/trip/today
 * Returns today's data split into present/absent lists.
 */
export const getTodayTripData = async (req, res, next) => {
    const userId = req.user.id;
    try {
        const driverRes = await pgPool.query(
            'SELECT id FROM public.driver WHERE user_id = $1', [userId]
        );
        if (driverRes.rowCount === 0) return next(new AppError('Driver profile not found', 404));
        const driverId = driverRes.rows[0].id;

        const today = new Date().toISOString().split('T')[0];

        const result = await pgPool.query(
            `SELECT
               c.id AS child_id,
               c.child_name,
               COALESCE(pas.is_present, true) AS is_present,
               COALESCE(pas.schedule_type, 'BOTH') AS schedule_type,
               pas.pickup_lat,
               pas.pickup_lon,
               pas.pickup_address,
               pas.dropoff_lat,
               pas.dropoff_lon,
               pas.dropoff_address,
               att.morning_pickup_time,
               att.last_action
             FROM public.children c
             LEFT JOIN public.parent_attendance_schedule pas
               ON pas.child_id = c.id AND pas.schedule_date = $2
             LEFT JOIN public.attendance att
               ON att.child_id = c.id AND att.date = $2
             WHERE c.assigned_driver_id = $1
             ORDER BY c.child_name`,
            [driverId, today]
        );

        const presentChildren = result.rows.filter(r => r.is_present);
        const absentChildren = result.rows.filter(r => !r.is_present);

        res.status(200).json({
            status: 'success',
            date: today,
            total: result.rows.length,
            present_count: presentChildren.length,
            absent_count: absentChildren.length,
            present: presentChildren,
            absent: absentChildren
        });
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};

/**
 * POST /driver/trip/create
 * Creates a trip and orders present children by nearest pickup (greedy nearest-neighbor).
 * Uses Haversine distance — no external API needed for ordering.
 */
export const createTrip = async (req, res, next) => {
    const userId = req.user.id;
    const { start_lat, start_lon, end_lat, end_lon, trip_type = 'MORNING' } = req.body;

    if (!start_lat || !start_lon) {
        return next(new AppError('start_lat and start_lon are required', 400));
    }

    const client = await pgPool.connect();
    try {
        const driverRes = await client.query(
            'SELECT id FROM public.driver WHERE user_id = $1', [userId]
        );
        if (driverRes.rowCount === 0) return next(new AppError('Driver profile not found', 404));
        const driverId = driverRes.rows[0].id;

        const today = new Date().toISOString().split('T')[0];
        await client.query('BEGIN');

        const tripRes = await client.query(
            `INSERT INTO public.bus_trips (driver_id, trip_date, trip_type, status, driver_start_latitude, driver_start_longitude, driver_end_latitude, driver_end_longitude, started_at)
             VALUES ($1, $2, $3, 'in_progress', $4, $5, $6, $7, NOW())
             RETURNING *`,
            [driverId, today, (trip_type || 'morning').toLowerCase(), start_lat, start_lon, end_lat || null, end_lon || null]
        );
        const trip = tripRes.rows[0];

        const childrenRes = await client.query(
            `SELECT c.id AS child_id, c.child_name,
                    COALESCE(pas.pickup_lat, c.home_lat) AS pickup_lat,
                    COALESCE(pas.pickup_lon, c.home_lng) AS pickup_lon,
                    pas.pickup_address AS pickup_address,
                    COALESCE(pas.dropoff_lat, NULL) AS dropoff_lat,
                    COALESCE(pas.dropoff_lon, NULL) AS dropoff_lon
             FROM public.children c
             LEFT JOIN public.parent_attendance_schedule pas
               ON pas.child_id = c.id AND pas.schedule_date = $2
             WHERE c.assigned_driver_id = $1
               AND COALESCE(pas.is_present, true) = true
               AND COALESCE(pas.pickup_lat, c.home_lat) IS NOT NULL`,
            [driverId, today]
        );

        // Greedy nearest-neighbor ordering (Haversine)
        const toRad = (deg) => (deg * Math.PI) / 180;
        const haversine = (lat1, lon1, lat2, lon2) => {
            const R = 6371;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        let currentLat = parseFloat(start_lat);
        let currentLon = parseFloat(start_lon);
        const unvisited = [...childrenRes.rows];
        const ordered = [];

        while (unvisited.length > 0) {
            let nearestIdx = 0;
            let nearestDist = Infinity;
            unvisited.forEach((child, idx) => {
                const dist = haversine(currentLat, currentLon, parseFloat(child.pickup_lat), parseFloat(child.pickup_lon));
                if (dist < nearestDist) { nearestDist = dist; nearestIdx = idx; }
            });
            const nearest = unvisited.splice(nearestIdx, 1)[0];
            ordered.push({ ...nearest, route_order: ordered.length + 1, distance_km: nearestDist.toFixed(2) });
            currentLat = parseFloat(nearest.pickup_lat);
            currentLon = parseFloat(nearest.pickup_lon);
        }

        for (const child of ordered) {
            await client.query(
                `INSERT INTO public.trip_children
                   (trip_id, child_id, attendance_status, pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, stop_order)
                 VALUES ($1, $2, 'present', $3, $4, $5, $6, $7)`,
                [trip.id, child.child_id, child.pickup_lat, child.pickup_lon,
                 child.dropoff_lat || null, child.dropoff_lon || null, child.route_order]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({
            status: 'success',
            trip: { ...trip, children_count: ordered.length },
            ordered_children: ordered
        });
    } catch (err) {
        await client.query('ROLLBACK');
        next(new AppError(err.message, 500));
    } finally {
        client.release();
    }
};

/**
 * GET /driver/trip/:tripId/boarding
 * Returns boarding status for all children in a trip.
 */
export const getBoardingStatus = async (req, res, next) => {
    const { tripId } = req.params;
    try {
        const result = await pgPool.query(
            `SELECT tc.id, tc.trip_id, tc.child_id, tc.attendance_status, tc.stop_order AS route_order,
                    tc.pickup_latitude AS pickup_lat, tc.pickup_longitude AS pickup_lon,
                    tc.dropoff_latitude AS dropoff_lat, tc.dropoff_longitude AS dropoff_lon,
                    tc.is_boarded, tc.boarded_at, tc.boarding_method,
                    c.child_name
             FROM public.trip_children tc
             JOIN public.children c ON c.id = tc.child_id
             WHERE tc.trip_id = $1
             ORDER BY tc.stop_order`,
            [tripId]
        );
        res.status(200).json({ status: 'success', data: result.rows });
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};

/**
 * POST /driver/trip/:tripId/child/:childId/board
 * Marks a child as boarded.
 */
export const markChildBoarded = async (req, res, next) => {
    const { tripId, childId } = req.params;
    const { board_method = 'manual' } = req.body;
    try {
        const result = await pgPool.query(
            `UPDATE public.trip_children
             SET is_boarded = true, boarded_at = NOW(), boarding_method = $3
             WHERE trip_id = $1 AND child_id = $2
             RETURNING *`,
            [tripId, childId, board_method]
        );
        if (result.rowCount === 0) return next(new AppError('Trip child record not found', 404));
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};
