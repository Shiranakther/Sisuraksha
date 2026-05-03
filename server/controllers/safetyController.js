import { pool } from '../config/postgres.js';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFootboardLiveState, updateFootboardLiveState } from '../realtime/footboardLive.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const driverHeartbeats = new Map();
const driverSystemEnabled = new Map();
const modelProcesses = new Map();
const driverDetectionModes = new Map();

const FOOTBOARD_ROOT = path.join(__dirname, '../../footboard safety');

const MODEL_CONFIG = {
  pythonCandidates: [
    path.join(FOOTBOARD_ROOT, '.venv/Scripts/python.exe'),
    path.join(FOOTBOARD_ROOT, 'venv/Scripts/python.exe'),
    path.join(__dirname, '../../.venv/Scripts/python.exe'),
  ],
  scriptPath: path.join(FOOTBOARD_ROOT, 'riyabeth_pro_safety.py'),
  cwd: FOOTBOARD_ROOT,
  startupGraceMs: 800,
};

function resolvePythonPath() {
  const overridePath = process.env.FOOTBOARD_PYTHON;
  if (overridePath && existsSync(overridePath)) return overridePath;

  for (const candidate of MODEL_CONFIG.pythonCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on', 'occupied', 'blocked'].includes(value.trim().toLowerCase());
  }
  return false;
}

function getDetectionModes(driverId) {
  const modes = driverDetectionModes.get(driverId) || {};
  return {
    aiEnabled: modes.aiEnabled !== false,
    irEnabled: modes.irEnabled !== false,
  };
}

function setDetectionModes(driverId, updates = {}) {
  const current = getDetectionModes(driverId);
  const next = {
    aiEnabled: updates.aiEnabled === undefined ? current.aiEnabled : parseBoolean(updates.aiEnabled),
    irEnabled: updates.irEnabled === undefined ? current.irEnabled : parseBoolean(updates.irEnabled),
  };

  driverDetectionModes.set(driverId, next);
  return next;
}

function normalizeHardwareAlert(body) {
  const hasStepPayload = ['s1', 's2', 's3'].some(key => Object.prototype.hasOwnProperty.call(body, key));
  if (!hasStepPayload) return null;

  const s1 = parseBoolean(body.s1);
  const s2 = parseBoolean(body.s2);
  const s3 = parseBoolean(body.s3);
  const risk = Number(body.risk ?? (s3 ? 3 : s2 ? 2 : s1 ? 1 : 0));

  let stepLabel = 'Clear';
  if (s3) stepLabel = 'Bottom Step';
  else if (s2) stepLabel = 'Mid Step';
  else if (s1) stepLabel = 'Top Step';

  const status = risk >= 3 ? 'CRITICAL' : risk >= 1 ? 'WARNING' : 'SAFE';
  const alertType = risk > 0 ? `IR Sensors Only (${stepLabel})` : 'IR Sensors Clear';
  const message = risk > 0
    ? `Footboard ${stepLabel.toLowerCase()} occupied from ESP32 IR sensor`
    : 'Footboard IR sensors clear';

  return {
    alert_type: alertType,
    status,
    speed: 0,
    confidence: risk > 0 ? 1 : 0,
    message,
    sound: risk > 0,
  };
}

export const startModel = (req, res) => {
  const { driver_id, camera_source, camera_url, esp32_cam_ip, phone_ip, ai_enabled, ir_enabled } = req.body;
  const driverId = driver_id || 'default';
  const detectionModes = setDetectionModes(driverId, { aiEnabled: ai_enabled, irEnabled: ir_enabled });

  if (modelProcesses.has(driverId)) {
    const existingProcess = modelProcesses.get(driverId);
    if (existingProcess && !existingProcess.killed) {
      return res.json({
        success: true,
        running: true,
        message: 'Model is already running',
        pid: existingProcess.pid
      });
    }
  }

  const pythonPath = resolvePythonPath();
  if (!pythonPath) {
    return res.status(500).json({
      success: false,
      error: 'Python environment not found for footboard safety',
      details: 'Expected footboard safety/.venv/Scripts/python.exe',
    });
  }

  if (!existsSync(MODEL_CONFIG.cwd) || !existsSync(MODEL_CONFIG.scriptPath)) {
    return res.status(500).json({
      success: false,
      error: 'Footboard safety script path is invalid',
      details: `script=${MODEL_CONFIG.scriptPath}`,
    });
  }

  try {
    console.log(`[Footboard ${driverId}] Starting model...`);
    console.log(`[Footboard ${driverId}] Python: ${pythonPath}`);
    console.log(`[Footboard ${driverId}] Script: ${MODEL_CONFIG.scriptPath}`);
    console.log(`[Footboard ${driverId}] CWD: ${MODEL_CONFIG.cwd}`);

    const args = [MODEL_CONFIG.scriptPath, '--driver_id', driverId];
    if (phone_ip) args.push('--phone_ip', phone_ip);
    if (esp32_cam_ip) args.push('--esp32_cam_ip', esp32_cam_ip);
    if (camera_source) args.push('--camera_source', camera_source);
    if (camera_url) args.push('--camera_url', camera_url);
    if (!detectionModes.aiEnabled) args.push('--disable_ai');
    if (!detectionModes.irEnabled) args.push('--disable_ir');

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
      console.log(`[Footboard ${driverId}] ${data.toString().trim()}`);
    });

    modelProcess.stderr.on('data', (data) => {
      console.error(`[Footboard ${driverId} ERR] ${data.toString().trim()}`);
    });

    modelProcess.on('close', (code) => {
      console.log(`[Footboard ${driverId}] Process exited with code ${code}`);
      modelProcesses.delete(driverId);

      if (!startupSettled) {
        failStartup('Footboard safety model exited during startup', `Exit code ${code}`);
      }
    });

    modelProcess.on('error', (err) => {
      console.error(`[Footboard ${driverId}] Error: ${err.message}`);
      modelProcesses.delete(driverId);

      if (!startupSettled) {
        failStartup('Failed to start footboard safety model', err.message);
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
        message: 'Model started successfully',
        pid: modelProcess.pid
      });
    }, MODEL_CONFIG.startupGraceMs);
  } catch (error) {
    console.error('Error starting model:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const stopModel = (req, res) => {
  const { driver_id } = req.body;
  const driverId = driver_id || 'default';

  const modelProcess = modelProcesses.get(driverId);

  if (!modelProcess) {
    return res.json({
      success: true,
      running: false,
      message: 'Model is not running'
    });
  }

  try {
    console.log(`[Footboard ${driverId}] Stopping model (PID: ${modelProcess.pid})...`);

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
      message: 'Model stopped successfully'
    });
  } catch (error) {
    console.error('Error stopping model:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

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

export const receiveHeartbeat = (req, res) => {
  const { driver_id } = req.body;
  const driverId = driver_id || 'default';

  driverHeartbeats.set(driverId, new Date());
  res.status(200).json({ success: true, message: 'Heartbeat received' });
};

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
  if (systemStatus === 'offline' && isModelRunning) {
    systemStatus = 'online';
  }

  res.json({
    status: systemStatus,
    enabled: isEnabled,
    modes: getDetectionModes(driverId),
    driver_id: driverId,
    lastHeartbeat: lastHeartbeat ? lastHeartbeat.toISOString() : null,
    uptime: lastHeartbeat ? Math.floor((Date.now() - lastHeartbeat.getTime()) / 1000) : null
  });
};

export const getDetectionModeStatus = (req, res) => {
  const { driver_id } = req.query;
  const driverId = driver_id || 'default';

  res.json({
    success: true,
    driver_id: driverId,
    ...getDetectionModes(driverId),
  });
};

export const updateDetectionModeStatus = (req, res) => {
  const { driver_id, ai_enabled, ir_enabled } = req.body;
  const driverId = driver_id || 'default';
  const modes = setDetectionModes(driverId, { aiEnabled: ai_enabled, irEnabled: ir_enabled });

  console.log(
    `[Footboard ${driverId}] Modes AI=${modes.aiEnabled ? 'ON' : 'OFF'} IR=${modes.irEnabled ? 'ON' : 'OFF'}`
  );

  res.json({
    success: true,
    driver_id: driverId,
    ...modes,
  });
};

export const receiveLiveState = (req, res) => {
  const state = updateFootboardLiveState(req.body);
  driverHeartbeats.set(req.body.driver_id || 'default', new Date());
  res.status(200).json({ success: true, data: state });
};

export const getLiveState = (req, res) => {
  res.json(getFootboardLiveState());
};

export const toggleSystem = (req, res) => {
  const { driver_id, enabled } = req.body;
  const driverId = driver_id || 'default';

  driverSystemEnabled.set(driverId, enabled);
  console.log(`[Footboard ${driverId}] System ${enabled ? 'ENABLED' : 'DISABLED'}`);

  res.json({
    success: true,
    enabled: enabled,
    driver_id: driverId,
    message: `Safety system ${enabled ? 'enabled' : 'disabled'}`
  });
};

export const createAlert = async (req, res) => {
  try {
    const hardwareAlert = normalizeHardwareAlert(req.body);
    const {
      driver_id,
      timestamp,
      alert_type,
      status,
      speed,
      confidence,
      message,
      sound
    } = hardwareAlert ? { ...req.body, ...hardwareAlert } : req.body;
    const driverId = driver_id || 'default';

    const isEnabled = driverSystemEnabled.get(driverId) !== false;
    if (!isEnabled) {
      return res.status(200).json({ success: false, message: 'System is disabled, alert not saved' });
    }

    const result = await pool.query(
      `INSERT INTO foot_board_safty (driver_id, timestamp, alert_type, status, speed, confidence, message, sound)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        driver_id || null,
        timestamp || new Date().toISOString(),
        alert_type || 'Footboard Event',
        status || 'SAFE',
        speed || 0,
        confidence || 0,
        message || 'Footboard safety event received',
        sound || false
      ]
    );

    console.log(`[Footboard ${driverId}] Alert: ${alert_type || 'Footboard Event'} - ${status || 'SAFE'} (${speed || 0} km/h)`);
    driverHeartbeats.set(driverId, new Date());

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error saving alert:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAlerts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const { driver_id } = req.query;

    let result;
    if (driver_id) {
      result = await pool.query(
        'SELECT * FROM foot_board_safty WHERE driver_id = $1 ORDER BY created_at DESC LIMIT $2',
        [driver_id, limit]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM foot_board_safty ORDER BY created_at DESC LIMIT $1',
        [limit]
      );
    }
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getCriticalAlerts = async (req, res) => {
  try {
    const { driver_id } = req.query;

    let query = `SELECT * FROM foot_board_safty
       WHERE (status = 'CRITICAL' OR alert_type = 'Danger')`;
    const params = [];

    if (driver_id) {
      query += ` AND driver_id = $1`;
      params.push(driver_id);
    }
    query += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getStats = async (req, res) => {
  try {
    const { driver_id } = req.query;

    let query = `
      SELECT
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN status = 'CRITICAL' THEN 1 END) as critical_count,
        COUNT(CASE WHEN status = 'WARNING' THEN 1 END) as warning_count,
        COUNT(CASE WHEN status = 'SAFE' THEN 1 END) as safe_count,
        MAX(created_at) as last_alert_time
      FROM foot_board_safty
      WHERE created_at > NOW() - INTERVAL '24 hours'`;

    const params = [];
    if (driver_id) {
      query += ` AND driver_id = $1`;
      params.push(driver_id);
    }

    const stats = await pool.query(query, params);

    const driverId = driver_id || 'default';
    const lastHeartbeat = driverHeartbeats.get(driverId);
    let systemStatus = 'offline';
    if (lastHeartbeat && (Date.now() - lastHeartbeat.getTime()) < 10000) {
      systemStatus = 'online';
    }

    res.json({
      systemStatus,
      lastHeartbeat: lastHeartbeat ? lastHeartbeat.toISOString() : null,
      ...stats.rows[0]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
