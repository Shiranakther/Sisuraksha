import { pool } from '../config/postgres.js';
import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store last heartbeat time in memory (per driver)
const driverHeartbeats = new Map();

// Store system enabled state (per driver)
const driverSystemEnabled = new Map();

// Store running model processes (per driver)
const modelProcesses = new Map();

// Model configuration for window safety
const WINDOW_SAFETY_ROOT = path.join(__dirname, '../../window safety');

const MODEL_CONFIG = {
  pythonCandidates: [
    path.join(WINDOW_SAFETY_ROOT, '.venv/Scripts/python.exe'),
    path.join(WINDOW_SAFETY_ROOT, 'venv/Scripts/python.exe'),
    path.join(__dirname, '../../.venv/Scripts/python.exe'),
  ],
  scriptPath: path.join(WINDOW_SAFETY_ROOT, 'bus_safety_demo.py'),
  cwd: WINDOW_SAFETY_ROOT,
  startupGraceMs: 1200,
};

function canRunPython(candidate) {
  const result = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });

  return {
    ok: result.status === 0,
    error: (result.stderr || result.error?.message || '').trim(),
  };
}

function resolvePythonPath() {
  const overridePath = process.env.WINDOW_SAFETY_PYTHON;
  if (overridePath && existsSync(overridePath)) {
    const check = canRunPython(overridePath);
    if (check.ok) return { path: overridePath, errors: [] };
    return { path: null, errors: [`${overridePath}: ${check.error || 'not runnable'}`] };
  }

  const errors = [];

  for (const candidate of MODEL_CONFIG.pythonCandidates) {
    if (!existsSync(candidate)) {
      errors.push(`${candidate}: missing`);
      continue;
    }

    const check = canRunPython(candidate);
    if (check.ok) return { path: candidate, errors };
    errors.push(`${candidate}: ${check.error || 'not runnable'}`);
  }

  return { path: null, errors };
}

// POST - Start model process
export const startModel = (req, res) => {
  const { driver_id, phone_ip } = req.body;
  const driverId = driver_id || 'default';

  // Check if already running
  if (modelProcesses.has(driverId)) {
    const existingProcess = modelProcesses.get(driverId);
    if (existingProcess && !existingProcess.killed) {
      return res.json({
        success: true,
        running: true,
        message: 'Window safety model is already running',
        pid: existingProcess.pid
      });
    }
  }

  const pythonResolution = resolvePythonPath();
  const pythonPath = pythonResolution.path;
  if (!pythonPath) {
    return res.status(500).json({
      success: false,
      error: 'Python environment not runnable for window safety',
      details: pythonResolution.errors.join('\n'),
    });
  }

  if (!existsSync(MODEL_CONFIG.cwd) || !existsSync(MODEL_CONFIG.scriptPath)) {
    return res.status(500).json({
      success: false,
      error: 'Window safety script path is invalid',
      details: `script=${MODEL_CONFIG.scriptPath}`,
    });
  }

  try {
    console.log(`🪟 Starting window safety model for driver ${driverId}...`);
    console.log(`📁 Python: ${pythonPath}`);
    console.log(`📁 Script: ${MODEL_CONFIG.scriptPath}`);
    console.log(`📁 CWD: ${MODEL_CONFIG.cwd}`);

    // Construct arguments array
    const args = [MODEL_CONFIG.scriptPath, '--driver_id', driverId];
    if (phone_ip) {
      args.push('--phone_ip', phone_ip);
    }

    const modelProcess = spawn(pythonPath, args, {
      cwd: MODEL_CONFIG.cwd,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let startupSettled = false;
    let startupTimer = null;

    const failStartup = (error, details) => {
      if (startupSettled) return;
      startupSettled = true;

      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }

      modelProcesses.delete(driverId);
      driverSystemEnabled.set(driverId, false);

      return res.status(500).json({ success: false, error, details });
    };

    modelProcess.stdout.on('data', (data) => {
      console.log(`[WindowSafety ${driverId}] ${data.toString().trim()}`);
    });

    modelProcess.stderr.on('data', (data) => {
      console.error(`[WindowSafety ${driverId} ERR] ${data.toString().trim()}`);
    });

    modelProcess.on('close', (code) => {
      console.log(`[WindowSafety ${driverId}] Process exited with code ${code}`);
      modelProcesses.delete(driverId);

      if (!startupSettled) {
        failStartup('Window safety model exited during startup', `Exit code ${code}`);
      }
    });

    modelProcess.on('error', (err) => {
      console.error(`[WindowSafety ${driverId}] Error: ${err.message}`);
      modelProcesses.delete(driverId);

      if (!startupSettled) {
        failStartup('Failed to start window safety model', err.message);
      }
    });

    startupTimer = setTimeout(() => {
      if (startupSettled) return;
      startupSettled = true;
      startupTimer = null;

      modelProcesses.set(driverId, modelProcess);
      driverSystemEnabled.set(driverId, true);

      res.json({
        success: true,
        running: true,
        message: 'Window safety model started successfully',
        pid: modelProcess.pid
      });
    }, MODEL_CONFIG.startupGraceMs);
  } catch (error) {
    console.error('Error starting window safety model:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST - Stop model process
export const stopModel = (req, res) => {
  const { driver_id } = req.body;
  const driverId = driver_id || 'default';

  const modelProcess = modelProcesses.get(driverId);

  if (!modelProcess) {
    return res.json({
      success: true,
      running: false,
      message: 'Window safety model is not running'
    });
  }

  try {
    console.log(`🛑 Stopping window safety model for driver ${driverId} (PID: ${modelProcess.pid})...`);

    // Kill the process tree on Windows
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', modelProcess.pid, '/f', '/t']);
    } else {
      modelProcess.kill('SIGTERM');
    }

    modelProcesses.delete(driverId);
    driverSystemEnabled.set(driverId, false);

    res.json({
      success: true,
      running: false,
      message: 'Window safety model stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping window safety model:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET - Check model status
export const getModelStatus = (req, res) => {
  const { driver_id } = req.query;
  const driverId = driver_id || 'default';

  const modelProcess = modelProcesses.get(driverId);
  const isRunning = modelProcess && !modelProcess.killed;

  res.json({
    running: isRunning,
    pid: isRunning ? modelProcess.pid : null,
    driver_id: driverId
  });
};

// POST - Receive heartbeat from model
export const receiveHeartbeat = (req, res) => {
  const { driver_id } = req.body;
  const driverId = driver_id || 'default';

  driverHeartbeats.set(driverId, new Date());
  res.status(200).json({ success: true, message: 'Heartbeat received' });
};

// GET - Check system status
export const getSystemStatus = (req, res) => {
  const { driver_id } = req.query;
  const driverId = driver_id || 'default';

  const lastHeartbeat = driverHeartbeats.get(driverId);
  const isEnabled = driverSystemEnabled.get(driverId) !== false;
  const modelProcess = modelProcesses.get(driverId);
  const isModelRunning = modelProcess && !modelProcess.killed;
  let systemStatus = 'offline';

  if (lastHeartbeat) {
    const timeSinceHeartbeat = Date.now() - lastHeartbeat.getTime();
    if (timeSinceHeartbeat < 10000) {
      systemStatus = 'online';
    }
  }

  res.json({
    status: systemStatus,
    enabled: isEnabled,
    modelRunning: isModelRunning,
    driver_id: driverId,
    lastHeartbeat: lastHeartbeat ? lastHeartbeat.toISOString() : null,
    uptime: lastHeartbeat ? Math.floor((Date.now() - lastHeartbeat.getTime()) / 1000) : null
  });
};

// POST - Toggle system enabled/disabled
export const toggleSystem = (req, res) => {
  const { driver_id, enabled } = req.body;
  const driverId = driver_id || 'default';

  driverSystemEnabled.set(driverId, enabled);
  console.log(`🪟 Window Safety ${enabled ? 'ENABLED' : 'DISABLED'} for driver ${driverId}`);

  res.json({
    success: true,
    enabled: enabled,
    driver_id: driverId,
    message: `Window safety system ${enabled ? 'enabled' : 'disabled'}`
  });
};

// POST - Receive alert from model
export const createAlert = async (req, res) => {
  try {
    const { driver_id, timestamp, alert_type, status, confidence, message, sound, detection_class } = req.body;
    const driverId = driver_id || 'default';

    // Check if system is enabled for this driver
    const isEnabled = driverSystemEnabled.get(driverId) !== false;
    if (!isEnabled) {
      return res.status(200).json({ success: false, message: 'System is disabled, alert not saved' });
    }

    const result = await pool.query(
      `INSERT INTO window_safety (driver_id, timestamp, alert_type, status, confidence, message, sound, detection_class)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        driver_id || null,
        timestamp || new Date().toISOString(),
        alert_type,
        status,
        confidence || 0,
        message,
        sound || false,
        detection_class || null
      ]
    );

    console.log(`🪟 Window Safety Alert: ${alert_type} - ${status} (${detection_class})`);

    // Update heartbeat on any alert
    driverHeartbeats.set(driverId, new Date());

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error saving window safety alert:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET - Fetch alerts for frontend
export const getAlerts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { driver_id } = req.query;

    let result;
    if (driver_id) {
      result = await pool.query(
        'SELECT * FROM window_safety WHERE driver_id = $1 ORDER BY created_at DESC LIMIT $2',
        [driver_id, limit]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM window_safety ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching window safety alerts:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET - Fetch critical alerts only
export const getCriticalAlerts = async (req, res) => {
  try {
    const { driver_id } = req.query;
    const limit = parseInt(req.query.limit) || 50;

    let result;
    if (driver_id) {
      result = await pool.query(
        `SELECT * FROM window_safety WHERE driver_id = $1 AND status = 'CRITICAL' ORDER BY created_at DESC LIMIT $2`,
        [driver_id, limit]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM window_safety WHERE status = 'CRITICAL' ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
    }

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching critical window safety alerts:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET - Get statistics
export const getStats = async (req, res) => {
  try {
    const { driver_id } = req.query;

    let totalQuery, criticalQuery, todayQuery;

    if (driver_id) {
      totalQuery = pool.query('SELECT COUNT(*) FROM window_safety WHERE driver_id = $1', [driver_id]);
      criticalQuery = pool.query(`SELECT COUNT(*) FROM window_safety WHERE driver_id = $1 AND status = 'CRITICAL'`, [driver_id]);
      todayQuery = pool.query(
        `SELECT COUNT(*) FROM window_safety WHERE driver_id = $1 AND created_at >= CURRENT_DATE`,
        [driver_id]
      );
    } else {
      totalQuery = pool.query('SELECT COUNT(*) FROM window_safety');
      criticalQuery = pool.query(`SELECT COUNT(*) FROM window_safety WHERE status = 'CRITICAL'`);
      todayQuery = pool.query(`SELECT COUNT(*) FROM window_safety WHERE created_at >= CURRENT_DATE`);
    }

    const [total, critical, today] = await Promise.all([totalQuery, criticalQuery, todayQuery]);

    res.json({
      totalAlerts: parseInt(total.rows[0].count),
      criticalAlerts: parseInt(critical.rows[0].count),
      todayAlerts: parseInt(today.rows[0].count)
    });
  } catch (error) {
    console.error('Error fetching window safety stats:', error);
    res.status(500).json({ error: error.message });
  }
};
