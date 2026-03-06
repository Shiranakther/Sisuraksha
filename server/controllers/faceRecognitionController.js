import { pool } from '../config/postgres.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import AppError from '../utils/appError.js';
import FormData from 'form-data';
import { addToBlockchain } from '../service/blockchainService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Flask Service Configuration ────────────────────────────────────────────

const FLASK_CONFIG = {
  pythonPath: path.join(__dirname, '../../face_recognition/venv/Scripts/python.exe'),
  scriptPath: path.join(__dirname, '../../face_recognition/flask_app.py'),
  cwd: path.join(__dirname, '../../face_recognition'),
  url: 'http://localhost:5002'
};

let flaskProcess = null;

// ─── Embedding Cache ────────────────────────────────────────────────────────

const embeddingCache = {
  data: null,
  lastUpdated: 0,
  TTL: 300_000 // 5 minutes
};

async function getEmbeddingsCached() {
  const now = Date.now();
  if (embeddingCache.data && (now - embeddingCache.lastUpdated) < embeddingCache.TTL) {
    console.log('[CACHE] Using cached face embeddings');
    return embeddingCache.data;
  }

  console.log('[CACHE] Refreshing face embeddings from database');
  try {
    const result = await pool.query(`
      SELECT fe.child_id, fe.embedding, fe.encoder_id, c.child_name
      FROM face_embeddings fe
      JOIN children c ON c.id = fe.child_id
      WHERE fe.is_active = true
    `);
    embeddingCache.data = result.rows;
    embeddingCache.lastUpdated = now;
    return embeddingCache.data;
  } catch (err) {
    // Table doesn't exist yet - migration not run
    if (err.code === '42P01') {
      console.warn('[FACE] face_embeddings table not found. Run the migration SQL first.');
      return [];
    }
    throw err;
  }
}

function invalidateCache() {
  embeddingCache.data = null;
  embeddingCache.lastUpdated = 0;
  console.log('[CACHE] Face embedding cache invalidated');
}

// ─── Flask Service Management ───────────────────────────────────────────────

// POST /api/face/service/start
export const startFlaskService = (req, res) => {
  if (flaskProcess && !flaskProcess.killed) {
    return res.json({
      success: true,
      running: true,
      message: 'Face recognition service is already running',
      pid: flaskProcess.pid
    });
  }

  try {
    console.log('🧠 Starting face recognition Flask service...');
    console.log(`📁 Python: ${FLASK_CONFIG.pythonPath}`);
    console.log(`📁 Script: ${FLASK_CONFIG.scriptPath}`);

    flaskProcess = spawn(FLASK_CONFIG.pythonPath, [FLASK_CONFIG.scriptPath], {
      cwd: FLASK_CONFIG.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });

    flaskProcess.stdout.on('data', (data) => {
      console.log(`[FaceRecognition] ${data.toString().trim()}`);
    });

    flaskProcess.stderr.on('data', (data) => {
      console.error(`[FaceRecognition ERR] ${data.toString().trim()}`);
    });

    flaskProcess.on('close', (code) => {
      console.log(`[FaceRecognition] Process exited with code ${code}`);
      flaskProcess = null;
    });

    flaskProcess.on('error', (err) => {
      console.error('[FaceRecognition] Failed to start:', err);
      flaskProcess = null;
    });

    res.json({
      success: true,
      running: true,
      message: 'Face recognition service started',
      pid: flaskProcess.pid
    });
  } catch (error) {
    console.error('Failed to start face recognition service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start service',
      details: error.message
    });
  }
};

// POST /api/face/service/stop
export const stopFlaskService = (req, res) => {
  if (!flaskProcess || flaskProcess.killed) {
    return res.json({
      success: true,
      running: false,
      message: 'Face recognition service is not running'
    });
  }

  try {
    flaskProcess.kill('SIGTERM');

    setTimeout(() => {
      if (flaskProcess && !flaskProcess.killed) {
        flaskProcess.kill('SIGKILL');
      }
    }, 3000);

    flaskProcess = null;

    res.json({
      success: true,
      running: false,
      message: 'Face recognition service stopped'
    });
  } catch (error) {
    console.error('Failed to stop face recognition service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop service',
      details: error.message
    });
  }
};

// GET /api/face/service/status
export const getServiceStatus = async (req, res) => {
  const isProcessAlive = flaskProcess && !flaskProcess.killed;

  let isResponding = false;
  if (isProcessAlive) {
    try {
      const healthRes = await axios.get(`${FLASK_CONFIG.url}/`, { timeout: 3000 });
      isResponding = healthRes.data?.status === 'running';
    } catch {
      isResponding = false;
    }
  }

  res.json({
    running: isProcessAlive,
    responding: isResponding,
    pid: isProcessAlive ? flaskProcess.pid : null
  });
};

// ─── Face Registration ──────────────────────────────────────────────────────

// POST /api/face/register
export const registerFace = async (req, res, next) => {
  const { child_id } = req.body;
  const userId = req.user.id;

  if (!child_id) {
    return next(new AppError('child_id is required', 400));
  }

  if (!req.files || req.files.length === 0) {
    return next(new AppError('At least 1 image is required (3 recommended)', 400));
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify parent owns this child
    const parentRes = await client.query(
      'SELECT id FROM public.parent WHERE user_id = $1', [userId]
    );
    if (parentRes.rowCount === 0) {
      throw new AppError('Parent profile not found', 404);
    }
    const parentId = parentRes.rows[0].id;

    const childCheck = await client.query(
      'SELECT id, child_name FROM public.children WHERE id = $1 AND parent_id = $2',
      [child_id, parentId]
    );
    if (childCheck.rowCount === 0) {
      throw new AppError('Child not found or does not belong to this parent', 404);
    }

    const childName = childCheck.rows[0].child_name;

    // Forward images to Flask service
    const formData = new FormData();
    formData.append('user_name', childName);
    formData.append('employee_master_id', child_id);

    for (const file of req.files) {
      formData.append('images', file.buffer, {
        filename: file.originalname || 'photo.jpg',
        contentType: file.mimetype || 'image/jpeg'
      });
    }

    let flaskResponse;
    try {
      flaskResponse = await axios.post(
        `${FLASK_CONFIG.url}/api/add_user`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 30000,
          maxContentLength: 50 * 1024 * 1024
        }
      );
    } catch (err) {
      if (err.response) {
        throw new AppError(err.response.data?.error || 'Face detection failed', 400);
      }
      throw new AppError('Face recognition service is not available. Please start it first.', 503);
    }

    const { embeddings, faces_saved } = flaskResponse.data;

    if (!embeddings || embeddings.length === 0) {
      throw new AppError('No valid faces detected in the uploaded images', 400);
    }

    // Remove old embeddings for this child
    await client.query(
      'DELETE FROM face_embeddings WHERE child_id = $1', [child_id]
    );

    // Store new embeddings
    for (let i = 0; i < embeddings.length; i++) {
      await client.query(
        `INSERT INTO face_embeddings (child_id, embedding, encoder_id, is_active)
         VALUES ($1, $2, $3, true)`,
        [child_id, embeddings[i], i]
      );
    }

    // Update child's face registration status
    await client.query(
      'UPDATE children SET is_face_registered = true WHERE id = $1',
      [child_id]
    );

    await client.query('COMMIT');

    // Invalidate cache so next verify picks up new embeddings
    invalidateCache();

    res.status(201).json({
      status: 'success',
      message: `Face registered for '${childName}' with ${faces_saved} images.`,
      faces_saved,
      child_id,
      child_name: childName
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error instanceof AppError ? error : new AppError(error.message, 500));
  } finally {
    client.release();
  }
};

// ─── Face Verification ──────────────────────────────────────────────────────

/**
 * Inserts or updates today's attendance row for a child.
 * Uses the same null-check logic as the RFID card controller:
 *   No record today         → INSERT  (MORNING_PICKUP)
 *   morning_drop_time null  → UPDATE  (MORNING_DROP)
 *   evening_pickup_time null → UPDATE (EVENING_PICKUP)
 *   evening_drop_time null  → UPDATE  (EVENING_DROP)
 *   All filled              → Day complete, no write
 */
async function recordAttendance(childId, latitude, longitude) {
  const today   = new Date().toISOString().split('T')[0];   // YYYY-MM-DD
  const nowTime = new Date().toTimeString().split(' ')[0];  // HH:MM:SS
  const lat = latitude  ?? null;
  const lon = longitude ?? null;

  try {
    // Fetch child's school_id — same as RFID controller reads child row
    const childRes = await pool.query(
      'SELECT school_id FROM public.children WHERE id = $1', [childId]
    );
    const schoolId = childRes.rows[0]?.school_id || null;

    // Check if an attendance row already exists for today
    const attCheck = await pool.query(
      'SELECT * FROM public.attendance WHERE child_id = $1 AND date = $2',
      [childId, today]
    );

    // ── FIRST SCAN OF THE DAY: MORNING PICKUP ──────────────────────────────
    if (attCheck.rowCount === 0) {
      await pool.query(
        `INSERT INTO public.attendance
           (child_id, date, school_id,
            morning_pickup_time, morning_pickup_lat, morning_pickup_lon,
            latitude, longitude, last_action, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MORNING_PICKUP', true)`,
        [childId, today, schoolId, nowTime, lat, lon, lat, lon]
      );

      await addToBlockchain(childId, 'MORNING_PICKUP', { lat, lon }, null);
      return { action: 'MORNING_PICKUP', message: 'Morning pickup recorded' };
    }

    // ── SUBSEQUENT SCANS: null-check each field in order ──────────────────
    const att = attCheck.rows[0];
    let timeField, latField, lonField, action, message;

    if (!att.morning_drop_time) {
      timeField = 'morning_drop_time';   latField = 'morning_drop_lat';   lonField = 'morning_drop_lon';   action = 'MORNING_DROP';   message = 'Arrived at school';
    } else if (!att.evening_pickup_time) {
      timeField = 'evening_pickup_time'; latField = 'evening_pickup_lat'; lonField = 'evening_pickup_lon'; action = 'EVENING_PICKUP'; message = 'Evening pickup recorded';
    } else if (!att.evening_drop_time) {
      timeField = 'evening_drop_time';   latField = 'evening_drop_lat';   lonField = 'evening_drop_lon';   action = 'EVENING_DROP';   message = 'Dropped home';
    } else {
      return { action: 'COMPLETE', message: 'Attendance already complete for today' };
    }

    await pool.query(
      `UPDATE public.attendance
         SET ${timeField} = $1, ${latField} = $2, ${lonField} = $3,
             latitude = $2, longitude = $3,
             last_action = $4, updated_at = NOW()
       WHERE id = $5`,
      [nowTime, lat, lon, action, att.id]
    );

    await addToBlockchain(childId, action, { lat, lon }, null);
    return { action, message };

  } catch (err) {
    console.error('[FACE] recordAttendance error:', err.message);
    // Do NOT throw — attendance failure must not block the face verify response
    return { action: 'ERROR', message: 'Face verified but attendance could not be saved' };
  }
}

// POST /api/face/verify
export const verifyFace = async (req, res, next) => {
  const { image, latitude, longitude } = req.body;

  if (!image) {
    return next(new AppError('image (base64) is required', 400));
  }

  try {
    // Load embeddings from cache or DB
    const storedEmbeddings = await getEmbeddingsCached();

    if (!storedEmbeddings || storedEmbeddings.length === 0) {
      return res.json({
        child_id: null,
        child_name: 'Unknown',
        confidence: 0,
        is_match: false,
        message: 'No registered faces in the system'
      });
    }

    // Format embeddings for Flask
    const embeddingsPayload = storedEmbeddings.map(row => ({
      child_id: row.child_id,
      child_name: row.child_name,
      embedding: row.embedding
    }));

    // Send to Flask
    let flaskResponse;
    try {
      flaskResponse = await axios.post(
        `${FLASK_CONFIG.url}/api/check_user`,
        { image, embeddings: embeddingsPayload },
        { timeout: 15000 }
      );
    } catch (err) {
      if (err.response) {
        throw new AppError(err.response.data?.error || 'Face verification failed', 400);
      }
      throw new AppError('Face recognition service is not available. Please start it first.', 503);
    }

    const result = flaskResponse.data;

    // If face matched, record attendance automatically
    if (result.is_match && result.child_id) {
      const attendance = await recordAttendance(result.child_id, latitude, longitude);
      return res.json({ ...result, attendance });
    }

    res.json(result);

  } catch (error) {
    next(error instanceof AppError ? error : new AppError(error.message, 500));
  }
};

// ─── Registration Status ────────────────────────────────────────────────────

// GET /api/face/status/:childId
export const getRegistrationStatus = async (req, res, next) => {
  const { childId } = req.params;

  if (!childId) {
    return next(new AppError('childId is required', 400));
  }

  try {
    // First check if is_face_registered column exists (migration may not be run)
    let isFaceRegistered = false;
    let childName = null;
    let embeddingCount = 0;

    try {
      const childRes = await pool.query(
        'SELECT id, child_name, is_face_registered FROM children WHERE id = $1',
        [childId]
      );
      if (childRes.rowCount === 0) {
        return next(new AppError('Child not found', 404));
      }
      isFaceRegistered = childRes.rows[0].is_face_registered || false;
      childName = childRes.rows[0].child_name;
    } catch (colErr) {
      // is_face_registered column doesn't exist yet — use basic query
      if (colErr.code === '42703') {
        const childRes = await pool.query(
          'SELECT id, child_name FROM children WHERE id = $1', [childId]
        );
        if (childRes.rowCount === 0) {
          return next(new AppError('Child not found', 404));
        }
        childName = childRes.rows[0].child_name;
      } else {
        throw colErr;
      }
    }

    try {
      const countRes = await pool.query(
        'SELECT COUNT(*) as count FROM face_embeddings WHERE child_id = $1 AND is_active = true',
        [childId]
      );
      embeddingCount = parseInt(countRes.rows[0].count);
      // Sync flag from actual embedding count if column was just added
      if (embeddingCount > 0) isFaceRegistered = true;
    } catch (tblErr) {
      // face_embeddings table doesn't exist — migration not run yet
      if (tblErr.code !== '42P01') throw tblErr;
      // Otherwise silently return count=0
    }

    res.json({
      status: 'success',
      data: {
        child_id: childId,
        child_name: childName,
        is_face_registered: isFaceRegistered,
        embedding_count: embeddingCount
      }
    });

  } catch (error) {
    console.error('[FACE] getRegistrationStatus error:', error.message);
    next(new AppError('Database error checking registration status', 500));
  }
};

// ─── Delete Embeddings ──────────────────────────────────────────────────────

// DELETE /api/face/register/:childId
export const deleteEmbeddings = async (req, res, next) => {
  const { childId } = req.params;
  const userId = req.user.id;

  if (!childId) {
    return next(new AppError('childId is required', 400));
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify parent owns this child
    const parentRes = await client.query(
      'SELECT id FROM public.parent WHERE user_id = $1', [userId]
    );
    if (parentRes.rowCount === 0) {
      throw new AppError('Parent profile not found', 404);
    }
    const parentId = parentRes.rows[0].id;

    const childCheck = await client.query(
      'SELECT id FROM public.children WHERE id = $1 AND parent_id = $2',
      [childId, parentId]
    );
    if (childCheck.rowCount === 0) {
      throw new AppError('Child not found or does not belong to this parent', 404);
    }

    // Delete embeddings
    const deleteResult = await client.query(
      'DELETE FROM face_embeddings WHERE child_id = $1', [childId]
    );

    // Update registration status
    await client.query(
      'UPDATE children SET is_face_registered = false WHERE id = $1', [childId]
    );

    await client.query('COMMIT');

    invalidateCache();

    res.json({
      status: 'success',
      message: `Deleted ${deleteResult.rowCount} face embeddings`,
      child_id: childId
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error instanceof AppError ? error : new AppError(error.message, 500));
  } finally {
    client.release();
  }
};
