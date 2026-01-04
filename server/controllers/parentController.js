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
export const getSchoolsForDropdown = async (req, res, next) => {
    try {
        const result = await pgPool.query('SELECT id, school_name FROM public.school ORDER BY school_name ASC');

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