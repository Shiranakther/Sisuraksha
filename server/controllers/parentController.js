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
        next(new AppError('Database error fetching children', 500));
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