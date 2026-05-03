import 'dotenv/config';
import { pool as pgPool } from './config/postgres.js';

async function testGetChildren() {
    try {
        console.log("Connecting to DB...");
        
        // 1. Get all users
        const users = await pgPool.query('SELECT * FROM public.users LIMIT 10');
        console.log(`Found ${users.rowCount} users.`);
        
        // 2. Get all parents
        const parents = await pgPool.query('SELECT * FROM public.parent LIMIT 10');
        console.log(`Found ${parents.rowCount} parents.`);
        
        // 3. Get all children
        const children = await pgPool.query('SELECT * FROM public.children LIMIT 10');
        console.log(`Found ${children.rowCount} children.`);
        if (children.rowCount > 0) {
            console.log("Sample child:", children.rows[0]);
        }
        
        // 4. Test the exact join query
        const query = `
            SELECT 
                c.id,
                c.child_name,
                c.school_id,
                c.card_id,
                c.assigned_driver_id,
                s.school_name,
                v.vehicle_number AS assigned_vehicle_number
            FROM public.children c
            LEFT JOIN public.school s ON c.school_id = s.id
            LEFT JOIN public.driver d ON c.assigned_driver_id = d.id
            LEFT JOIN public.vehicles v ON d.id = v.driver_id
            ORDER BY c.created_at DESC
        `;
        const joinTest = await pgPool.query(query);
        console.log(`Join query successful. Returned ${joinTest.rowCount} rows.`);
        if (joinTest.rowCount > 0) {
            console.log("Sample join result:", joinTest.rows[0]);
        }
        
    } catch (e) {
        console.error("SQL Error:", e.message);
    } finally {
        process.exit(0);
    }
}

testGetChildren();
