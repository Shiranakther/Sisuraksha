import dotenv from 'dotenv';
dotenv.config();
import { pool } from './server/config/postgres.js';

async function test() {
  try {
    const res = await pool.query(`
      SELECT a.id, a.child_id, c.child_name, c.assigned_driver_id, a.last_action, s.school_latitude, s.school_longitude, a.morning_pickup_lat, a.morning_pickup_lon 
      FROM public.attendance a 
      JOIN public.children c ON a.child_id = c.id 
      JOIN public.school s ON c.school_id = s.id 
      WHERE a.date = CURRENT_DATE
    `);
    console.log("Attendance today:", res.rows);
    
    const drivers = await pool.query("SELECT * FROM public.driver");
    console.log("Drivers:", drivers.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
test();
