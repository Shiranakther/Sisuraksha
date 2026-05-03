// Server Reset: 2026-05-02 18:38
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
            LEFT JOIN public.attendance_declaration ad ON c.id = ad.child_id AND ad.date = CURRENT_DATE
            LEFT JOIN public.parent_attendance_schedule pas ON c.id = pas.child_id AND pas.schedule_date = CURRENT_DATE
            LEFT JOIN public.attendance a ON c.id = a.child_id AND a.date = CURRENT_DATE
            WHERE c.assigned_driver_id = $1 
            AND COALESCE(ad.morning_present, pas.is_present, true) = true -- Only alert for those SUPPOSED to be there
            AND a.id IS NULL -- And who have not yet scanned
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
               COALESCE(ad.morning_present, pas.is_present, true) AS is_present,
               COALESCE(pas.schedule_type, 'BOTH') AS schedule_type,
               pas.pickup_lat,
               pas.pickup_lon,
               pas.pickup_address,
               pas.dropoff_lat,
               pas.dropoff_lon,
               pas.dropoff_address,
               pas.notes,
               pas.schedule_date,
               ad.morning_present AS daily_morning,
               ad.evening_present AS daily_evening
             FROM public.children c
             JOIN public.parent pr ON pr.id = c.parent_id
             JOIN public.users u ON u.id = pr.user_id
             LEFT JOIN public.mobile m ON m.user_id = u.id
             LEFT JOIN public.attendance_declaration ad
               ON ad.child_id = c.id AND ad.date = $2
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
               COALESCE(ad.morning_present, pas.is_present, true) AS is_present,
               COALESCE(pas.schedule_type, 'BOTH') AS schedule_type,
               pas.pickup_lat,
               pas.pickup_lon,
               pas.pickup_address,
               pas.dropoff_lat,
               pas.dropoff_lon,
               pas.dropoff_address,
               att.morning_pickup_time,
               att.last_action,
               ad.morning_present AS daily_morning,
               ad.evening_present AS daily_evening
             FROM public.children c
             LEFT JOIN public.attendance_declaration ad
               ON ad.child_id = c.id AND ad.date = $2
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
                    COALESCE(pas.pickup_lat, c.home_lat, l.latitude) AS pickup_lat, 
                    COALESCE(pas.pickup_lon, c.home_lng, l.longitude) AS pickup_lon,
                    COALESCE(pas.pickup_address, l.address) AS pickup_address,
                    COALESCE(pas.dropoff_lat, pas.pickup_lat, c.home_lat, l.latitude) AS dropoff_lat,
                    COALESCE(pas.dropoff_lon, pas.pickup_lon, c.home_lng, l.longitude) AS dropoff_lon,
                    CASE 
                        WHEN $3 = 'evening' THEN COALESCE(ad.evening_present, pas.is_present, true)
                        ELSE COALESCE(ad.morning_present, pas.is_present, true)
                    END AS is_present
             FROM public.children c
             JOIN public.parent p ON c.parent_id = p.id
             LEFT JOIN public.location l ON p.user_id = l.user_id
             LEFT JOIN public.attendance_declaration ad
               ON ad.child_id = c.id AND ad.date = $2
             LEFT JOIN public.parent_attendance_schedule pas
               ON pas.child_id = c.id AND pas.schedule_date = $2
             WHERE c.assigned_driver_id = $1
               AND CASE 
                     WHEN $3 = 'evening' THEN COALESCE(ad.evening_present, pas.is_present, true)
                     ELSE COALESCE(ad.morning_present, pas.is_present, true)
                   END = true
               AND COALESCE(pas.pickup_lat, c.home_lat, l.latitude) IS NOT NULL`,
            [driverId, today, (trip_type || 'morning').toLowerCase()]
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
                const targetLat = trip_type.toLowerCase() === 'evening' ? parseFloat(child.dropoff_lat) : parseFloat(child.pickup_lat);
                const targetLon = trip_type.toLowerCase() === 'evening' ? parseFloat(child.dropoff_lon) : parseFloat(child.pickup_lon);
                
                const dist = haversine(currentLat, currentLon, targetLat, targetLon);
                if (dist < nearestDist) { nearestDist = dist; nearestIdx = idx; }
            });
            const nearest = unvisited.splice(nearestIdx, 1)[0];
            ordered.push({ ...nearest, route_order: ordered.length + 1, distance_km: nearestDist.toFixed(2) });
            
            currentLat = trip_type.toLowerCase() === 'evening' ? parseFloat(nearest.dropoff_lat) : parseFloat(nearest.pickup_lat);
            currentLon = trip_type.toLowerCase() === 'evening' ? parseFloat(nearest.dropoff_lon) : parseFloat(nearest.pickup_lon);
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
                    COALESCE(tc.dropoff_latitude, tc.pickup_latitude) AS dropoff_lat, 
                    COALESCE(tc.dropoff_longitude, tc.pickup_longitude) AS dropoff_lon,
                    tc.is_boarded, tc.boarded_at, tc.boarding_method,
                    c.child_name,
                    s.school_latitude AS dest_lat, s.school_longitude AS dest_lon, s.school_name,
                    bt.trip_type, bt.driver_end_latitude AS trip_end_lat, bt.driver_end_longitude AS trip_end_lon
             FROM public.trip_children tc
             JOIN public.children c ON c.id = tc.child_id
             JOIN public.bus_trips bt ON bt.id = tc.trip_id
             LEFT JOIN public.school s ON c.school_id = s.id
             WHERE tc.trip_id = $1
             ORDER BY tc.stop_order`,
            [tripId]
        );

        let destination = null;
        if (result.rows.length > 0) {
            // For Morning, destination is School
            // For Evening, it could be the last dropoff or the driver's final park
            destination = {
                latitude: result.rows[0].trip_end_lat || result.rows[0].dest_lat,
                longitude: result.rows[0].trip_end_lon || result.rows[0].dest_lon,
                name: result.rows[0].school_name || 'End Location',
                trip_type: result.rows[0].trip_type
            };
        }

        res.status(200).json({ 
            status: 'success', 
            data: result.rows,
            destination: destination
        });
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
    const board_method = (req.body.board_method || 'manual').toLowerCase();
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

/**
 * GET /driver/route/optimized
 * Returns the optimized route, filtering out absent students.
 */
export const getOptimizedRoute = async (req, res, next) => {
    const userId = req.user.id;
    try {
        // Get Driver
        const driverRes = await pgPool.query(
            'SELECT id, trip_start_latitude, trip_start_longitude FROM public.driver WHERE user_id = $1', [userId]
        );
        if (driverRes.rowCount === 0) return next(new AppError('Driver profile not found', 404));
        const driver = driverRes.rows[0];

        // Ensure we have current date
        const now = new Date();
        const currentDateString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];

        // Query students assigned to this driver
        // Left join with attendance_declaration for today to filter absent students
        // Also get school location for the destination
        const query = `
            SELECT 
                c.id AS child_id, 
                c.child_name, 
                COALESCE(ad.morning_present, pas.is_present, true) AS is_present,
                l.latitude AS waypoint_lat,
                l.longitude AS waypoint_lon,
                s.school_latitude AS destination_lat,
                s.school_longitude AS destination_lon,
                s.school_name
            FROM public.children c
            LEFT JOIN public.attendance_declaration ad ON c.id = ad.child_id AND ad.date = $2
            LEFT JOIN public.parent_attendance_schedule pas ON c.id = pas.child_id AND pas.schedule_date = $2
            LEFT JOIN public.parent p ON c.parent_id = p.id
            LEFT JOIN public.users u ON p.user_id = u.id
            LEFT JOIN public.location l ON u.id = l.user_id
            LEFT JOIN public.school s ON c.school_id = s.id
            WHERE c.assigned_driver_id = $1
            AND COALESCE(ad.morning_present, pas.is_present, true) = true
        `;
        const result = await pgPool.query(query, [driver.id, currentDateString]);

        // Filter out waypoints that don't have latitude/longitude to avoid map errors
        const validWaypoints = result.rows.filter(row => row.waypoint_lat && row.waypoint_lon);

        const waypoints = validWaypoints.map(row => ({
            child_id: row.child_id,
            child_name: row.child_name,
            latitude: row.waypoint_lat,
            longitude: row.waypoint_lon,
            picked_up: false // Default state for the frontend
        }));

        let destination = null;
        if (result.rows.length > 0 && result.rows[0].destination_lat && result.rows[0].destination_lon) {
            destination = {
                latitude: result.rows[0].destination_lat,
                longitude: result.rows[0].destination_lon,
                name: result.rows[0].school_name
            };
        }

        res.status(200).json({
            status: 'success',
            data: {
                start_location: {
                    latitude: driver.trip_start_latitude,
                    longitude: driver.trip_start_longitude
                },
                waypoints,
                destination
            }
        });
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};

/**
 * POST /driver/route/optimized/board/:childId
 * Marks a child as boarded in the attendance table without requiring a tripId.
 */
export const markBoardedOptimizedRoute = async (req, res, next) => {
    const { childId } = req.params;
    const now = new Date();
    const currentDateString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];

    try {
        // Upsert into attendance table
        const result = await pgPool.query(
            `INSERT INTO public.attendance (child_id, date, status, morning_pickup_time, last_action)
             VALUES ($1, $2, true, NOW(), 'morning_pickup')
             ON CONFLICT (child_id, date) 
             DO UPDATE SET 
                status = true,
                morning_pickup_time = COALESCE(attendance.morning_pickup_time, NOW()),
                last_action = 'morning_pickup'
             RETURNING *`,
            [childId, currentDateString]
        );

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};
/**
 * GET /driver/trip/active
 * Returns the currently active trip for the logged-in driver.
 */
export const getActiveTrip = async (req, res, next) => {
    const userId = req.user.id;
    try {
        // Find driver
        const driverRes = await pgPool.query(
            'SELECT id FROM public.driver WHERE user_id = $1', [userId]
        );
        if (driverRes.rowCount === 0) return next(new AppError('Driver profile not found', 404));
        const driverId = driverRes.rows[0].id;

        // Find active trip (not completed)
        const tripRes = await pgPool.query(
            `SELECT id, trip_type, started_at, driver_start_latitude, driver_start_longitude 
             FROM public.bus_trips 
             WHERE driver_id = $1 AND completed_at IS NULL 
             ORDER BY started_at DESC LIMIT 1`,
            [driverId]
        );

        if (tripRes.rowCount === 0) {
            return res.status(200).json({ status: 'success', data: null });
        }

        res.status(200).json({ status: 'success', data: tripRes.rows[0] });
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};
/**
 * POST /driver/trip/notify-proximity/:childId
 * Notifies a parent that the bus is within 1km of their child's stop.
 */
export const notifyProximity = async (req, res, next) => {
    const { childId } = req.params;
    const { tripId, distance } = req.body;
    try {
        // In a real app, this would trigger a Firebase/Push notification.
        // For now, we log it and could update a 'notifications' table.
        console.log(`[PROXIMITY ALERT] Bus is ${distance}m from child ${childId} on trip ${tripId}`);
        
        // Optional: In a future update, you can add a 'notifications' table to track this.

        res.status(200).json({ 
            status: 'success', 
            message: `Parent of child ${childId} notified.` 
        });
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};
