import 'dotenv/config';
import { pool } from './config/postgres.js';

async function testQuery() {
    try {
        const query = `
            SELECT id, driver_id, timestamp, alert_type, severity, confidence, message, sound, detection_class, created_at
            FROM driver_monitoring 
            WHERE driver_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2
        `;
        const res = await pool.query(query, ['8c394627-e397-4bd5-928f-4cc66cfebac1', 50]);
        console.log("Query OK:", res.rows);
    } catch (e) {
        console.error("Query Failed:", e.message);
    } finally {
        pool.end();
    }
}

testQuery();
