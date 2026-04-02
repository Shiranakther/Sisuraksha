import 'dotenv/config';
import { pool } from './config/postgres.js';

async function testQuery() {
    try {
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
            AND a.id IS NULL
            ORDER BY s.school_name ASC
        `;
        const res = await pool.query(query, ['00000000-0000-0000-0000-000000000000']);
        console.log("Query OK:", res.rows);
    } catch (e) {
        console.error("Query Failed:", e.message);
    } finally {
        pool.end();
    }
}

testQuery();
