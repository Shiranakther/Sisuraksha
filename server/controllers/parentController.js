import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';

export const registerParentProfile = async (req, res, next) => {
    const { user_id } = req.body;

    //  Basic Validation
    if (!user_id) {
        return next(new AppError('Missing required field: user_id', 400));
    }

    const client = await pgPool.connect();

    try {
        await client.query('BEGIN');

        //  Check for duplicate Parent Profile
        // we must manually check to prevent multiple parent profiles for the same user.
        const existingParent = await client.query(
            'SELECT id FROM public.parent WHERE user_id = $1',
            [user_id]
        );

        if (existingParent.rows.length > 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Parent profile already exists for this user', 409));
        }

        // 3. Insert into Parent table
        const parentResult = await client.query(`
            INSERT INTO public.parent (user_id)
            VALUES ($1)
            RETURNING id, created_at
        `, [user_id]);

        const newParent = parentResult.rows[0];

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            data: {
                parentId: newParent.id,
                userId: user_id,
                createdAt: newParent.created_at
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');

        // Handle "User not found" explicitly if the foreign key fails
        if (error.code === '23503') { // PostgreSQL foreign_key_violation code
            return next(new AppError('User ID does not exist in users table', 404));
        }

        next(new AppError(error.message, 500));
    } finally {
        client.release();
    }
};



//  Get List of Schools (Unchanged) 
// export const getSchoolsForDropdown = async (req, res, next) => {
//     try {
//         const result = await pgPool.query('SELECT id, school_name FROM public.school ORDER BY school_name ASC');

//         res.status(200).json({
//             status: 'success',
//             results: result.rows.length,
//             data: result.rows 
//         });
//     } catch (error) {
//         next(new AppError('Database error fetching schools', 500));
//     }
// };

export const getSchoolsForDropdown = async (req, res, next) => {
    try {
        //  UPDATED QUERY: Added latitude, longitude
        const result = await pgPool.query('SELECT id, school_name, school_latitude, school_longitude FROM public.school ORDER BY school_name ASC');

        res.status(200).json({
            status: 'success',
            results: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        next(new AppError('Database error fetching schools', 500));
    }
};

//  Register Child (Updated for your Schema) 
export const registerChild = async (req, res, next) => {
    const { child_name, school_id } = req.body;
    const user_uuid = req.user.id; // The UUID from the logged-in User's token

    // 1. Basic Validation
    if (!child_name || !school_id) {
        return next(new AppError('Please provide child name and school.', 400));
    }

    const client = await pgPool.connect();

    try {
        await client.query('BEGIN');

        //  Find the correct 'parent_id' (bigint) for this user
        // The children table links to 'public.parent', not 'public.users'
        const parentRes = await client.query(
            'SELECT id FROM public.parent WHERE user_id = $1',
            [user_uuid]
        );

        if (parentRes.rowCount === 0) {
            throw new AppError('Parent profile not found. Please complete parent registration first.', 404);
        }

        const parentId = parentRes.rows[0].id;

        // Insert Child Record

        const insertQuery = `
            INSERT INTO public.children (
                id,
                child_name, 
                parent_id, 
                school_id
            ) VALUES (gen_random_uuid(), $1, $2, $3) 
            RETURNING id, child_name, school_id, created_at;
        `;

        const result = await client.query(insertQuery, [
            child_name,
            parentId,
            school_id
        ]);

        await client.query('COMMIT');

        res.status(201).json({
            status: 'success',
            message: 'Child registered successfully',
            data: result.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        // Handle constraint violations (e.g., if child somehow exists or school_id is invalid)
        if (error.code === '23503') { // Foreign key violation
            return next(new AppError('Invalid School ID provided.', 400));
        }
        next(error instanceof AppError ? error : new AppError(error.message, 500));
    } finally {
        client.release();
    }
};


export const getMyChildren = async (req, res, next) => {
    const user_uuid = req.user.id;

    try {
        //  Get Parent ID
        const parentRes = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [user_uuid]);
        if (parentRes.rowCount === 0) return next(new AppError('Parent profile not found.', 404));
        const parentId = parentRes.rows[0].id;

        //  Get Children + School Name + Assigned Vehicle Number
        const query = `
            SELECT 
                c.id,
                c.child_name,
                c.school_id,
                c.card_id,
                c.assigned_driver_id, -- 👈 Get Driver ID
                s.school_name,
                v.vehicle_number AS assigned_vehicle_number -- 👈 Get Vehicle Number
            FROM public.children c
            LEFT JOIN public.school s ON c.school_id = s.id
            LEFT JOIN public.driver d ON c.assigned_driver_id = d.id  -- Join Driver
            LEFT JOIN public.vehicles v ON d.id = v.driver_id         -- Join Vehicle
            WHERE c.parent_id = $1
            ORDER BY c.created_at DESC
        `;

        const childrenRes = await pgPool.query(query, [parentId]);

        res.status(200).json({
            status: 'success',
            results: childrenRes.rowCount,
            data: childrenRes.rows
        });

    } catch (error) {
        console.error("GET MY CHILDREN ERROR:", error);
        next(new AppError(`Database error fetching children: ${error.message}`, 500));
    }
};


export const getParentAttendance = async (req, res, next) => {
    const user_uuid = req.user.id;
    const { childId, date } = req.query; // Optional filters

    try {
        // 1. Get Parent ID from User ID
        const parentRes = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [user_uuid]);
        if (parentRes.rowCount === 0) return next(new AppError('Parent profile not found.', 404));
        const parentId = parentRes.rows[0].id;

        // 2. Build the Query
        // We join 'attendance' -> 'children' to filter by parent_id
        let query = `
            SELECT 
                a.id AS attendance_id,
                c.child_name,
                s.school_name,
                a.date,
                a.status AS is_present,
                a.morning_pickup_time,
                a.morning_drop_time,
                a.evening_pickup_time,
                a.evening_drop_time,
                a.morning_pickup_lat,
                a.morning_pickup_lon,
                a.morning_drop_lat,
                a.morning_drop_lon,
                a.evening_pickup_lat,
                a.evening_pickup_lon,
                a.evening_drop_lat,
                a.evening_drop_lon,
                a.last_action
            FROM public.attendance a
            JOIN public.children c ON a.child_id = c.id
            LEFT JOIN public.school s ON a.school_id = s.id
            WHERE c.parent_id = $1
        `;

        const params = [parentId];
        let paramCount = 1;

        // 3. Optional: Filter by specific Child
        if (childId) {
            paramCount++;
            query += ` AND c.id = $${paramCount}`;
            params.push(childId);
        }

        // 4. Optional: Filter by specific Date
        if (date) {
            paramCount++;
            query += ` AND a.date = $${paramCount}`;
            params.push(date);
        }

        // Order by newest first
        query += ` ORDER BY a.date DESC, a.created_at DESC LIMIT 50`;

        const result = await pgPool.query(query, params);

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        next(new AppError('Database error fetching attendance', 500));
    }
};


// ========== ATTENDANCE DECLARATION (Parent Pre-Declaration) ==========

/**
 * Set or Update Attendance Declaration for a Child
 * POST /parent/declare-attendance
 * Body: { childId, date?, morningPresent?, eveningPresent? }
 */
export const setAttendanceDeclaration = async (req, res, next) => {
    const user_uuid = req.user.id;
    const { childId, date, morningPresent, eveningPresent } = req.body;

    if (!childId) {
        return next(new AppError('childId is required', 400));
    }

    const targetDate = date || new Date().toISOString().split('T')[0]; // Default to today

    // ADDR Validations
    const now = new Date();
    // Use the server's local time (or requested timezone)
    const currentLocalString = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    
    if (targetDate !== currentLocalString) {
        return next(new AppError('Attendance can only be marked for the current date.', 400));
    }

    const currentDay = now.getDay();
    if (currentDay === 0 || currentDay === 6) {
        return next(new AppError('Attendance submissions are blocked on weekends.', 400));
    }

    if (morningPresent !== undefined) {
        // const currentHour = now.getHours();
        // if (currentHour >= 12) {
        //     return next(new AppError('Morning attendance cannot be updated after 12:00 PM.', 400));
        // }
    }

    const client = await pgPool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verify parent owns this child
        const parentRes = await client.query('SELECT id FROM public.parent WHERE user_id = $1', [user_uuid]);
        if (parentRes.rowCount === 0) {
            throw new AppError('Parent profile not found.', 404);
        }
        const parentId = parentRes.rows[0].id;

        const childCheck = await client.query(
            'SELECT id FROM public.children WHERE id = $1 AND parent_id = $2',
            [childId, parentId]
        );
        if (childCheck.rowCount === 0) {
            throw new AppError('Child not found or does not belong to this parent.', 404);
        }

        // 2. Upsert attendance declaration
        const upsertQuery = `
            INSERT INTO public.attendance_declaration (child_id, date, morning_present, evening_present)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (child_id, date) 
            DO UPDATE SET 
                morning_present = COALESCE($3, attendance_declaration.morning_present),
                evening_present = COALESCE($4, attendance_declaration.evening_present),
                updated_at = NOW()
            RETURNING *;
        `;

        const result = await client.query(upsertQuery, [
            childId,
            targetDate,
            morningPresent !== undefined ? morningPresent : true,
            eveningPresent !== undefined ? eveningPresent : true
        ]);

        await client.query('COMMIT');

        res.status(200).json({
            status: 'success',
            message: 'Attendance declaration updated',
            data: result.rows[0]
        });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error instanceof AppError ? error : new AppError(error.message, 500));
    } finally {
        client.release();
    }
};


/**
 * Get Attendance Declaration for a Child (for a specific date or today)
 * GET /parent/attendance-declaration/:childId?date=YYYY-MM-DD
 */
export const getAttendanceDeclaration = async (req, res, next) => {
    const user_uuid = req.user.id;
    const { childId } = req.params;
    const { date } = req.query;

    if (!childId) {
        return next(new AppError('childId is required', 400));
    }

    const targetDate = date || new Date().toISOString().split('T')[0];

    try {
        // 1. Verify parent owns this child
        const parentRes = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [user_uuid]);
        if (parentRes.rowCount === 0) {
            return next(new AppError('Parent profile not found.', 404));
        }
        const parentId = parentRes.rows[0].id;

        const childCheck = await pgPool.query(
            'SELECT id, child_name FROM public.children WHERE id = $1 AND parent_id = $2',
            [childId, parentId]
        );
        if (childCheck.rowCount === 0) {
            return next(new AppError('Child not found or does not belong to this parent.', 404));
        }

        // 2. Get declaration
        const result = await pgPool.query(
            'SELECT * FROM public.attendance_declaration WHERE child_id = $1 AND date = $2',
            [childId, targetDate]
        );

        // If no declaration exists, return defaults (both present)
        const declaration = result.rows[0] || {
            child_id: childId,
            date: targetDate,
            morning_present: true,
            evening_present: true
        };

        res.status(200).json({
            status: 'success',
            data: {
                ...declaration,
                child_name: childCheck.rows[0].child_name
            }
        });

    } catch (error) {
        next(new AppError('Database error fetching declaration', 500));
    }
};


// ========== ATTENDANCE SCHEDULE (Weekly / Daily Pickup Settings) ==========

/**
 * POST /parent/attendance-schedule
 * Set or update pickup schedule for a child on specific dates.
 * Body: { childId, schedules: [{ date, isPresent, scheduleType, pickupLat, pickupLon, pickupAddress, dropoffLat, dropoffLon, dropoffAddress, notes }] }
 */
export const setAttendanceSchedule = async (req, res, next) => {
    const user_uuid = req.user.id;
    const { childId, schedules } = req.body;

    if (!childId || !schedules || !Array.isArray(schedules) || schedules.length === 0) {
        return next(new AppError('childId and schedules array are required', 400));
    }

    const client = await pgPool.connect();

    try {
        await client.query('BEGIN');

        // Verify parent owns this child
        const parentRes = await client.query('SELECT id FROM public.parent WHERE user_id = $1', [user_uuid]);
        if (parentRes.rowCount === 0) throw new AppError('Parent profile not found.', 404);
        const parentId = parentRes.rows[0].id;

        const childCheck = await client.query(
            'SELECT id FROM public.children WHERE id = $1 AND parent_id = $2',
            [childId, parentId]
        );
        if (childCheck.rowCount === 0) throw new AppError('Child not found or does not belong to this parent.', 404);

        const results = [];

        for (const schedule of schedules) {
            const {
                date: scheduleDate,
                isPresent = true,
                scheduleType = 'BOTH',
                pickupLat, pickupLon, pickupAddress,
                dropoffLat, dropoffLon, dropoffAddress,
                notes
            } = schedule;

            if (!scheduleDate) continue;

            const result = await client.query(
                `INSERT INTO public.parent_attendance_schedule
                    (child_id, parent_id, schedule_date, is_present, schedule_type,
                     pickup_lat, pickup_lon, pickup_address,
                     dropoff_lat, dropoff_lon, dropoff_address, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                 ON CONFLICT (child_id, schedule_date)
                 DO UPDATE SET
                    is_present = EXCLUDED.is_present,
                    schedule_type = EXCLUDED.schedule_type,
                    pickup_lat = COALESCE(EXCLUDED.pickup_lat, parent_attendance_schedule.pickup_lat),
                    pickup_lon = COALESCE(EXCLUDED.pickup_lon, parent_attendance_schedule.pickup_lon),
                    pickup_address = COALESCE(EXCLUDED.pickup_address, parent_attendance_schedule.pickup_address),
                    dropoff_lat = COALESCE(EXCLUDED.dropoff_lat, parent_attendance_schedule.dropoff_lat),
                    dropoff_lon = COALESCE(EXCLUDED.dropoff_lon, parent_attendance_schedule.dropoff_lon),
                    dropoff_address = COALESCE(EXCLUDED.dropoff_address, parent_attendance_schedule.dropoff_address),
                    notes = COALESCE(EXCLUDED.notes, parent_attendance_schedule.notes),
                    updated_at = NOW()
                 RETURNING *`,
                [childId, parentId, scheduleDate, isPresent, scheduleType,
                    pickupLat || null, pickupLon || null, pickupAddress || null,
                    dropoffLat || null, dropoffLon || null, dropoffAddress || null,
                    notes || null]
            );
            results.push(result.rows[0]);
        }

        await client.query('COMMIT');

        res.status(200).json({
            status: 'success',
            message: `${results.length} schedule(s) saved`,
            data: results
        });

    } catch (error) {
        await client.query('ROLLBACK');
        next(error instanceof AppError ? error : new AppError(error.message, 500));
    } finally {
        client.release();
    }
};


/**
 * GET /parent/attendance-schedule/:date
 * Get schedules for a specific date (or week range via query params).
 * Query: ?childId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export const getAttendanceSchedule = async (req, res, next) => {
    const user_uuid = req.user.id;
    const { date } = req.params;
    const { childId, from, to } = req.query;

    try {
        const parentRes = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [user_uuid]);
        if (parentRes.rowCount === 0) return next(new AppError('Parent profile not found.', 404));
        const parentId = parentRes.rows[0].id;

        let query = `
            SELECT pas.*, c.child_name
            FROM public.parent_attendance_schedule pas
            JOIN public.children c ON c.id = pas.child_id
            WHERE pas.parent_id = $1
        `;
        const params = [parentId];
        let paramCount = 1;

        if (childId) {
            paramCount++;
            query += ` AND pas.child_id = $${paramCount}`;
            params.push(childId);
        }

        if (from && to) {
            paramCount++;
            query += ` AND pas.schedule_date >= $${paramCount}`;
            params.push(from);
            paramCount++;
            query += ` AND pas.schedule_date <= $${paramCount}`;
            params.push(to);
        } else if (date && date !== 'range') {
            paramCount++;
            query += ` AND pas.schedule_date = $${paramCount}`;
            params.push(date);
        }

        query += ` ORDER BY pas.schedule_date ASC, c.child_name ASC`;

        const result = await pgPool.query(query, params);

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        next(new AppError('Database error fetching schedule', 500));
    }
};


/**
 * GET /parent/attendance-history
 * Returns combined view: schedules + actual attendance for all children.
 * Query: ?childId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export const getAttendanceHistory = async (req, res, next) => {
    const user_uuid = req.user.id;
    const { childId, from, to } = req.query;

    try {
        const parentRes = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [user_uuid]);
        if (parentRes.rowCount === 0) return next(new AppError('Parent profile not found.', 404));
        const parentId = parentRes.rows[0].id;

        let query = `
            SELECT
                c.id AS child_id,
                c.child_name,
                pas.schedule_date,
                pas.is_present AS scheduled_present,
                pas.schedule_type,
                pas.pickup_address,
                pas.dropoff_address,
                pas.notes,
                a.status AS actual_status,
                a.morning_pickup_time,
                a.morning_drop_time,
                a.evening_pickup_time,
                a.evening_drop_time,
                a.last_action
            FROM public.parent_attendance_schedule pas
            JOIN public.children c ON c.id = pas.child_id
            LEFT JOIN public.attendance a ON a.child_id = c.id AND a.date::date = pas.schedule_date::date
            WHERE pas.parent_id = $1
        `;
        const params = [parentId];
        let paramCount = 1;

        if (childId) {
            paramCount++;
            query += ` AND c.id = $${paramCount}`;
            params.push(childId);
        }
        if (from) {
            paramCount++;
            query += ` AND pas.schedule_date >= $${paramCount}`;
            params.push(from);
        }
        if (to) {
            paramCount++;
            query += ` AND pas.schedule_date <= $${paramCount}`;
            params.push(to);
        }

        query += ` ORDER BY pas.schedule_date DESC, c.child_name ASC LIMIT 200`;

        const result = await pgPool.query(query, params);

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        next(new AppError('Database error fetching attendance history', 500));
    }
};


/**
 * GET /parent/holidays
 * Returns holidays list. Query: ?year=2025
 */
export const getHolidays = async (req, res, next) => {
    const { year } = req.query;

    try {
        let query = 'SELECT * FROM public.holidays';
        const params = [];

        if (year) {
            query += ' WHERE EXTRACT(YEAR FROM holiday_date) = $1';
            params.push(year);
        }

        query += ' ORDER BY holiday_date ASC';

        const result = await pgPool.query(query, params);

        res.status(200).json({
            status: 'success',
            results: result.rowCount,
            data: result.rows
        });

    } catch (error) {
        next(new AppError('Database error fetching holidays', 500));
    }
};

/**
 * GET /parent/live-tracking
 * Returns real-time location and ETA for the bus assigned to the parent's children.
 */
export const getLiveTracking = async (req, res, next) => {
    const user_uuid = req.user.id;

    try {
        // 1. Get Parent ID
        const parentRes = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [user_uuid]);
        if (parentRes.rowCount === 0) return next(new AppError('Parent profile not found.', 404));
        const parentId = parentRes.rows[0].id;

        // 2. Get Children and their assigned drivers
        const childrenRes = await pgPool.query(`
            SELECT c.id, c.child_name, c.assigned_driver_id, d.user_id AS driver_user_id,
                   v.vehicle_number, u.first_name AS driver_name
            FROM public.children c
            JOIN public.driver d ON c.assigned_driver_id = d.id
            JOIN public.users u ON d.user_id = u.id
            LEFT JOIN public.vehicles v ON v.driver_id = d.id
            WHERE c.parent_id = $1 AND c.assigned_driver_id IS NOT NULL
            LIMIT 1
        `, [parentId]);

        if (childrenRes.rowCount === 0) {
            return res.status(200).json({ status: 'success', data: null, message: 'No driver assigned' });
        }

        const child = childrenRes.rows[0];
        const driverId = child.assigned_driver_id;

        // 3. Get Active Trip for this driver
        const tripRes = await pgPool.query(`
            SELECT id, status, trip_type, started_at
            FROM public.bus_trips
            WHERE driver_id = $1 AND status = 'IN_PROGRESS'
            ORDER BY started_at DESC LIMIT 1
        `, [driverId]);

        if (tripRes.rowCount === 0) {
            return res.status(200).json({ status: 'success', data: null, message: 'No active trip in progress' });
        }

        const trip = tripRes.rows[0];

        // 4. Get Current Driver Location
        const locRes = await pgPool.query(`
            SELECT latitude, longitude, speed, heading, updated_at
            FROM public.driver_live_location
            WHERE driver_id = $1
            ORDER BY updated_at DESC LIMIT 1
        `, [driverId]);

        // 5. Get Parent's Stop Location (Home Location)
        const stopRes = await pgPool.query(`
            SELECT latitude, longitude, address
            FROM public.location
            WHERE user_id = $1
            LIMIT 1
        `, [user_uuid]);

        const parentStop = stopRes.rows[0] || { latitude: 6.9271, longitude: 79.8612, address: 'Home' }; // Fallback

        const busLocation = locRes.rows[0] || { 
            latitude: 6.9290, 
            longitude: 79.8630, 
            speed: 0, 
            heading: 0, 
            updated_at: new Date().toISOString() 
        };

        res.status(200).json({
            status: 'success',
            data: {
                tripId: trip.id,
                tripStatus: trip.status,
                tripType: trip.trip_type,
                driver: {
                    id: driverId,
                    name: child.driver_name,
                    vehicleNumber: child.vehicle_number
                },
                busLocation: {
                    latitude: parseFloat(busLocation.latitude),
                    longitude: parseFloat(busLocation.longitude),
                    speed: parseFloat(busLocation.speed || 0),
                    heading: parseFloat(busLocation.heading || 0),
                    lastUpdated: busLocation.updated_at
                },
                parentStop: {
                    latitude: parseFloat(parentStop.latitude),
                    longitude: parseFloat(parentStop.longitude),
                    name: parentStop.address
                }
            }
        });

    } catch (error) {
        console.error("LIVE TRACKING ERROR:", error);
        next(new AppError(`Error fetching live tracking: ${error.message}`, 500));
    }
};