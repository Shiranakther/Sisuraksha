import bcrypt from 'bcryptjs';
import { pool } from './config/postgres.js';
import 'dotenv/config';

const seedAdmin = async () => {
    const email = 'superadmin@sisuraksha.com';
    const password = 'superadmin';
    const role = 'SuperAdmin';
    const firstName = 'Super';
    const lastName = 'Admin';

    try {
        console.log('Connecting to database...');
        
        // Check if admin already exists
        const checkResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (checkResult.rows.length > 0) {
            console.log(`Admin account with email ${email} already exists!`);
        } else {
            console.log('Creating new Super Admin...');
            const passwordHash = await bcrypt.hash(password, 10);
            
            await pool.query(
                `INSERT INTO users (email, password_hash, role, first_name, last_name, is_active) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [email, passwordHash, role, firstName, lastName, true]
            );
            console.log('Successfully created the Super Admin account!');
        }
    } catch (err) {
        console.error('Error seeding admin account:', err);
    } finally {
        await pool.end();
        console.log('Database connection closed.');
    }
};

seedAdmin();
