import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.POSTGRES_URI;

const pool = new Pool({
  connectionString,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
  max: 10,
  min: 1,
  idleTimeoutMillis: 60000,        // keep idle connections for 60s
  connectionTimeoutMillis: 10000,   // wait up to 10s to acquire a connection
  allowExitOnIdle: false,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Swallow per-client errors so the pool can recycle dead connections
// instead of crashing the process.
pool.on('error', (err) => {
  console.error('pg pool background client error:', err.message);
});

// Retries a pool query once on transient connection timeout errors.
const RETRYABLE = ['Connection terminated unexpectedly', 'Connection terminated due to connection timeout'];
export const queryWithRetry = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    const isRetryable = RETRYABLE.some(msg => err.message?.includes(msg));
    if (isRetryable) {
      console.warn('[pg] Retrying query after connection error:', err.message);
      return await pool.query(text, params);
    }
    throw err;
  }
};

// Test connection
pool.query('SELECT NOW()')
  .then(() => console.log('Supabase PostgreSQL connected successfully.'))
  .catch(err => console.error('Supabase PostgreSQL connection error:', err.stack));

export { pool };
