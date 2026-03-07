import axios from 'axios';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { pool } from './config/postgres.js';
import fs from 'fs';

async function testAlerts() {
    try {
        const driver = await pool.query('SELECT user_id FROM driver LIMIT 1');
        if (driver.rowCount === 0) return;
        const userId = driver.rows[0].user_id;

        const token = jwt.sign(
            { userId: userId, role: 'Driver' }, 
            process.env.JWT_ACCESS_SECRET || 'secret' // Make sure this matches actual secret
        );

        const res = await axios.get('http://localhost:5000/api/driver/alerts', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        fs.writeFileSync('test_response.json', JSON.stringify(res.data, null, 2));

    } catch (err) {
        if (err.response) {
            fs.writeFileSync('test_response.json', JSON.stringify({
                status: err.response.status,
                data: err.response.data
            }, null, 2));
        } else {
            console.error(err.message);
        }
    } finally {
        pool.end();
    }
}

testAlerts();
