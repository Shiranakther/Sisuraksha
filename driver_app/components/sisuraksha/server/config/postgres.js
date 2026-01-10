import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.POSTGRES_URI;

const pool = new Pool({
  connectionString,
  ssl: {
    require: true,
    rejectUnauthorized: false  
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection
pool.query('SELECT NOW()')
  .then(() => console.log('Supabase PostgreSQL connected successfully.'))
  .catch(err => console.error('Supabase PostgreSQL connection error:', err.stack));

export { pool };
