import { pool } from '../config/postgres.js';
import { spawn, exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { existsSync } from 'fs';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store last heartbeat time in memory (per driver)
const driverHeartbeats = new Map();

// Store system enabled state (per driver)
const driverSystemEnabled = new Map();

// Store running model processes (per driver)
const modelProcesses = new Map();

// Calibration runtime status (per driver)
const calibrationStatusByDriver = new Map();
const modelStdoutRemainders = new Map();

const CALIBRATION_STATUS_PREFIX = '[CALIB_STATUS]';
const DEFAULT_CALIBRATION_TOTAL_FRAMES = 30;

function createDefaultCalibrationStatus() {
  return {
    status: 'IDLE',
    inProgress: false,
    progressPercent: 0,
    framesCollected: 0,
    totalFrames: DEFAULT_CALIBRATION_TOTAL_FRAMES,
    instruction: '',
    rejectReason: '',
    skipReason: '',
    attempt: 0,
    autoRetryUsed: false,
    source: 'manual',
    stageName: '',
    stagePhase: '',
    acceptedSampleCount: 0,
    skippedFrameCount: 0,
    updatedAt: null,
  };
}

function getCalibrationStatusSnapshot(driverId) {
  return calibrationStatusByDriver.get(driverId) || createDefaultCalibrationStatus();
}

function setCalibrationStatus(driverId, patch) {
  const next = {
    ...getCalibrationStatusSnapshot(driverId),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  calibrationStatusByDriver.set(driverId, next);
  return next;
}

function consumeCalibrationLine(driverId, line) {
  if (!line.startsWith(CALIBRATION_STATUS_PREFIX)) return false;

  const payloadText = line.slice(CALIBRATION_STATUS_PREFIX.length).trim();
  if (!payloadText) return true;

  try {
    const payload = JSON.parse(payloadText);
    const status = typeof payload.status === 'string' ? payload.status : 'IN_PROGRESS';
    const progressPercent = Number(payload.progressPercent ?? payload.progress ?? 0);
    const framesCollected = Number(payload.framesCollected ?? 0);
    const totalFrames = Number(payload.totalFrames ?? DEFAULT_CALIBRATION_TOTAL_FRAMES);
    const inProgress = payload.inProgress ?? ['IN_PROGRESS', 'REJECTED'].includes(status);

    setCalibrationStatus(driverId, {
      status,
      inProgress: Boolean(inProgress),
      progressPercent: Number.isFinite(progressPercent) ? progressPercent : 0,
      framesCollected: Number.isFinite(framesCollected) ? framesCollected : 0,
      totalFrames: Number.isFinite(totalFrames) && totalFrames > 0 ? totalFrames : DEFAULT_CALIBRATION_TOTAL_FRAMES,
      instruction: typeof payload.instruction === 'string' ? payload.instruction : '',
      rejectReason: typeof payload.rejectReason === 'string' ? payload.rejectReason : '',
      skipReason: typeof payload.skipReason === 'string' ? payload.skipReason : '',
      attempt: Number.isFinite(Number(payload.attempt)) ? Number(payload.attempt) : 0,
      autoRetryUsed: Boolean(payload.autoRetryUsed),
      source: typeof payload.source === 'string' ? payload.source : 'manual',
      stageName: typeof payload.stageName === 'string' ? payload.stageName : '',
      stagePhase: typeof payload.stagePhase === 'string' ? payload.stagePhase : '',
      acceptedSampleCount: Number.isFinite(Number(payload.acceptedSampleCount)) ? Number(payload.acceptedSampleCount) : 0,
      skippedFrameCount: Number.isFinite(Number(payload.skippedFrameCount)) ? Number(payload.skippedFrameCount) : 0,
    });
  } catch (err) {
    console.warn(`[Driver Monitor ${driverId}] Invalid calibration status payload: ${payloadText}`);
  }

  return true;
}

function processModelStdoutChunk(driverId, chunk) {
  const previous = modelStdoutRemainders.get(driverId) || '';
  const combined = `${previous}${chunk}`;
  const lines = combined.split(/\r?\n/);
  modelStdoutRemainders.set(driverId, lines.pop() ?? '');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!consumeCalibrationLine(driverId, line)) {
      console.log(`[Driver Monitor ${driverId}] ${line}`);
    }
  }
}

// Model configuration for driver monitoring
const DRIVER_MONITOR_ROOT = path.join(__dirname, '../../Driver monitering');
const MODEL_CONFIG = {
  pythonCandidates: [
    path.join(DRIVER_MONITOR_ROOT, '.venv/Scripts/python.exe'),
    path.join(DRIVER_MONITOR_ROOT, 'venv/Scripts/python.exe'),
    path.join(__dirname, '../../.venv/Scripts/python.exe'),
  ],
  scriptPath: path.join(DRIVER_MONITOR_ROOT, 'driver_monitoring/main.py'),
  cwd: path.join(DRIVER_MONITOR_ROOT, 'driver_monitoring'),
  startupGraceMs: 800,
};

function resolvePythonPath() {
  const overridePath = process.env.DRIVER_MONITOR_PYTHON;
  if (overridePath && existsSync(overridePath)) return overridePath;

  for (const candidate of MODEL_CONFIG.pythonCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

// ── Startup cleanup ─────────────────────────────────────────────
// When nodemon restarts the server, previously spawned Python processes
// become orphans (Node.js does NOT kill children on exit on Windows).
// Kill any leftover main.py processes so they don't show a stale window.
function killOrphanedMonitors() {
  const scriptName = 'main.py';
  if (os.platform() === 'win32') {
    // On Windows, use WMIC to find and kill Python processes running main.py
    exec(
      `wmic process where "name='python.exe' and CommandLine like '%main.py%'" call terminate`,
      (err, stdout) => {
        if (stdout && stdout.includes('ReturnValue = 0')) {
          console.log('[Driver Monitor] Cleaned up orphaned monitor processes on startup.');
        }
      }
    );
  } else {
    exec(`pkill -f ${scriptName}`, () => {});
  }
}
killOrphanedMonitors();

// POST - Start model process
export const startModel = (req, res) => {
  const { driver_id } = req.body;
  const driverId = driver_id || 'default';
  
  // Check if already running
  if (modelProcesses.has(driverId)) {
    const existingProcess = modelProcesses.get(driverId);
    if (existingProcess && !existingProcess.killed) {
      return res.json({ 
        success: true, 
        running: true, 
        message: 'Driver monitoring model is already running',
        pid: existingProcess.pid 
      });
    }
  }

  const pythonPath = resolvePythonPath();
  if (!pythonPath) {
    return res.status(500).json({
      success: false,
      error: 'Python environment not found for driver monitor',
      details: 'Expected Driver monitering/.venv/Scripts/python.exe',
    });
  }

  if (!existsSync(MODEL_CONFIG.cwd) || !existsSync(MODEL_CONFIG.scriptPath)) {
    return res.status(500).json({
      success: false,
      error: 'Driver monitor script path is invalid',
      details: `script=${MODEL_CONFIG.scriptPath}`,
    });
  }
  
  try {
    console.log(`🚗 Starting driver monitoring model for driver ${driverId}...`);
    console.log(`📁 Python: ${pythonPath}`);
    console.log(`📁 Script: ${MODEL_CONFIG.scriptPath}`);
    console.log(`📁 CWD: ${MODEL_CONFIG.cwd}`);
    
    const modelProcess = spawn(pythonPath, [MODEL_CONFIG.scriptPath], {
      cwd: MODEL_CONFIG.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    modelStdoutRemainders.set(driverId, '');
    setCalibrationStatus(driverId, createDefaultCalibrationStatus());

    let startupSettled = false;

    const failStartup = (error, details) => {
      if (startupSettled) return;
      startupSettled = true;
      modelProcesses.delete(driverId);
      modelStdoutRemainders.delete(driverId);
      setCalibrationStatus(driverId, {
        ...createDefaultCalibrationStatus(),
        status: 'FAILED',
        inProgress: false,
        instruction: 'Calibration unavailable: monitor failed to start.',
      });
      return res.status(500).json({ success: false, error, details });
    };
    
    modelProcess.stdout.on('data', (data) => {
      processModelStdoutChunk(driverId, data.toString());
    });
    
    modelProcess.stderr.on('data', (data) => {
      console.error(`[Driver Monitor ${driverId} ERR] ${data.toString().trim()}`);
    });
    
    modelProcess.on('close', (code) => {
      console.log(`[Driver Monitor ${driverId}] Process exited with code ${code}`);
      modelProcesses.delete(driverId);
      modelStdoutRemainders.delete(driverId);

      const previousStatus = getCalibrationStatusSnapshot(driverId);
      if (previousStatus.inProgress) {
        setCalibrationStatus(driverId, {
          ...createDefaultCalibrationStatus(),
          status: 'FAILED',
          inProgress: false,
          instruction: 'Calibration interrupted because monitor stopped.',
        });
      } else {
        setCalibrationStatus(driverId, createDefaultCalibrationStatus());
      }

      if (!startupSettled) {
        failStartup('Model process exited during startup', `Exit code ${code}`);
      }
    });
    
    modelProcess.on('error', (err) => {
      console.error(`[Driver Monitor ${driverId}] Failed to start:`, err);
      failStartup('Failed to start model process', err.message);
    });
    
    modelProcesses.set(driverId, modelProcess);

    setTimeout(() => {
      if (startupSettled) return;

      if (modelProcess.exitCode !== null || modelProcess.killed) {
        failStartup('Model process failed to stay alive after launch', `Exit code ${modelProcess.exitCode}`);
        return;
      }

      startupSettled = true;
      res.json({
        success: true,
        running: true,
        message: 'Driver monitoring model started successfully',
        pid: modelProcess.pid,
      });
    }, MODEL_CONFIG.startupGraceMs);
    
  } catch (error) {
    console.error('Failed to start driver monitoring model:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start model',
      details: error.message 
    });
  }
};

// POST - Stop model process
export const stopModel = (req, res) => {
  const { driver_id } = req.body;
  const driverId = driver_id || 'default';
  
  if (!modelProcesses.has(driverId)) {
    return res.json({ 
      success: true, 
      running: false, 
      message: 'Model is not running' 
    });
  }
  
  try {
    const modelProcess = modelProcesses.get(driverId);
    
    if (modelProcess && !modelProcess.killed) {
      const pid = modelProcess.pid;
      
      if (os.platform() === 'win32') {
        // SIGTERM is not real on Windows — use taskkill to force-kill the process tree
        exec(`taskkill /F /T /PID ${pid}`, (err) => {
          if (err) console.error(`[Driver Monitor] taskkill error for PID ${pid}:`, err.message);
        });
      } else {
        modelProcess.kill('SIGTERM');
        setTimeout(() => {
          if (!modelProcess.killed) modelProcess.kill('SIGKILL');
        }, 3000);
      }
    }
    
    modelProcesses.delete(driverId);
    modelStdoutRemainders.delete(driverId);
    setCalibrationStatus(driverId, createDefaultCalibrationStatus());
    
    res.json({ 
      success: true, 
      running: false,
      message: 'Driver monitoring model stopped successfully' 
    });
    
  } catch (error) {
    console.error('Failed to stop driver monitoring model:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to stop model',
      details: error.message 
    });
  }
};

// GET - Check model status
export const getModelStatus = (req, res) => {
  const { driver_id } = req.query;
  const driverId = driver_id || 'default';
  
  const modelProcess = modelProcesses.get(driverId);
  const isRunning = Boolean(modelProcess && !modelProcess.killed && modelProcess.exitCode === null);
  
  res.json({
    running: isRunning,
    pid: isRunning ? modelProcess.pid : null
  });
};

// POST - Trigger runtime calibration on a running model process
export const calibrateModel = (req, res) => {
  const { driver_id } = req.body;
  const driverId = driver_id || 'default';

  const modelProcess = modelProcesses.get(driverId);
  const isRunning = Boolean(modelProcess && !modelProcess.killed && modelProcess.exitCode === null);

  if (!isRunning) {
    return res.status(409).json({
      success: false,
      error: 'Driver monitor model is not running',
      details: 'Start the model before triggering calibration.',
    });
  }

  if (!modelProcess.stdin || modelProcess.stdin.destroyed || !modelProcess.stdin.writable) {
    return res.status(500).json({
      success: false,
      error: 'Model command channel unavailable',
      details: 'Cannot send recalibration command to monitor process.',
    });
  }

  try {
    setCalibrationStatus(driverId, {
      status: 'IN_PROGRESS',
      inProgress: true,
      progressPercent: 0,
      framesCollected: 0,
      instruction: 'Calibration starting. Look forward with a neutral face until it completes.',
      rejectReason: '',
      skipReason: '',
      attempt: 1,
      autoRetryUsed: false,
      source: 'manual',
      stageName: 'FORWARD',
      stagePhase: 'collect',
      acceptedSampleCount: 0,
      skippedFrameCount: 0,
    });

    modelProcess.stdin.write('recalibrate\n');

    return res.json({
      success: true,
      status: 'IN_PROGRESS',
      message: 'Calibration command sent successfully.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to trigger calibration',
      details: error.message,
    });
  }
};

// POST - Retry only the currently paused calibration stage
export const retryCalibrationStage = (req, res) => {
  const { driver_id } = req.body;
  const driverId = driver_id || 'default';

  const modelProcess = modelProcesses.get(driverId);
  const isRunning = Boolean(modelProcess && !modelProcess.killed && modelProcess.exitCode === null);
  if (!isRunning) {
    return res.status(409).json({
      success: false,
      error: 'Driver monitor model is not running',
      details: 'Start the model before retrying calibration.',
    });
  }

  const currentStatus = getCalibrationStatusSnapshot(driverId);
  if (currentStatus.status !== 'PAUSED') {
    return res.status(409).json({
      success: false,
      error: 'Calibration stage is not paused',
      details: 'Retry stage is only available when calibration is paused.',
    });
  }

  if (!modelProcess.stdin || modelProcess.stdin.destroyed || !modelProcess.stdin.writable) {
    return res.status(500).json({
      success: false,
      error: 'Model command channel unavailable',
      details: 'Cannot send retry command to monitor process.',
    });
  }

  try {
    setCalibrationStatus(driverId, {
      status: 'IN_PROGRESS',
      inProgress: true,
      instruction: currentStatus.instruction || 'Retrying the paused stage. Follow the stage prompt.',
      rejectReason: '',
      skipReason: '',
      autoRetryUsed: false,
    });

    modelProcess.stdin.write('retry\n');

    return res.json({
      success: true,
      status: 'IN_PROGRESS',
      message: 'Retry command sent successfully.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to retry calibration stage',
      details: error.message,
    });
  }
};

// GET - Read latest calibration progress/status
export const getCalibrationStatus = (req, res) => {
  const { driver_id } = req.query;
  const driverId = driver_id || 'default';
  res.json(getCalibrationStatusSnapshot(driverId));
};

// POST - Receive heartbeat from Python model
export const receiveHeartbeat = async (req, res) => {
  const { driver_id } = req.body;
  
  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required' });
  }
  
  const now = new Date();
  driverHeartbeats.set(driver_id, now);
  
  // Initialize system as enabled if not set
  if (!driverSystemEnabled.has(driver_id)) {
    driverSystemEnabled.set(driver_id, true);
  }
  
  res.json({ 
    success: true, 
    timestamp: now,
    system_enabled: driverSystemEnabled.get(driver_id)
  });
};

// GET - Get system status
export const getSystemStatus = (req, res) => {
  const { driver_id } = req.query;
  
  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required' });
  }
  
  const lastHeartbeat = driverHeartbeats.get(driver_id);
  const isEnabled = driverSystemEnabled.get(driver_id) ?? true;
  
  // System is online if heartbeat received within last 15 seconds
  const isOnline = lastHeartbeat && (Date.now() - lastHeartbeat.getTime() < 15000);
  
  res.json({
    status: isOnline ? 'online' : 'offline',
    enabled: isEnabled,
    lastHeartbeat: lastHeartbeat || null
  });
};

// POST - Toggle system on/off
export const toggleSystem = (req, res) => {
  const { driver_id, enabled } = req.body;
  
  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required' });
  }
  
  driverSystemEnabled.set(driver_id, enabled);
  
  res.json({
    success: true,
    enabled: enabled
  });
};

// POST - Create new alert
export const createAlert = async (req, res) => {
  const { driver_id, alert_type, severity, confidence, message, sound, detection_class } = req.body;
  
  if (!driver_id || !alert_type || !severity) {
    return res.status(400).json({ error: 'driver_id, alert_type, and severity are required' });
  }
  
  try {
    const query = `
      INSERT INTO driver_monitoring (driver_id, alert_type, severity, confidence, message, sound, detection_class, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    
    const values = [driver_id, alert_type, severity, confidence || null, message || null, sound || false, detection_class || null, Date.now()];
    const result = await pool.query(query, values);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create driver monitoring alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
};

// GET - Get alerts for driver
export const getAlerts = async (req, res) => {
  const { driver_id, limit = 50 } = req.query;
  
  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required' });
  }
  
  try {
    const query = `
      SELECT id, driver_id, timestamp, alert_type, severity, confidence, message, sound, detection_class, created_at
      FROM driver_monitoring 
      WHERE driver_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const result = await pool.query(query, [driver_id, parseInt(limit)]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch driver monitoring alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};

// GET - Get critical alerts (DANGER only)
export const getCriticalAlerts = async (req, res) => {
  const { driver_id, limit = 20 } = req.query;
  
  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required' });
  }
  
  try {
    const query = `
      SELECT id, driver_id, timestamp, alert_type, severity, confidence, message, sound, detection_class, created_at
      FROM driver_monitoring 
      WHERE driver_id = $1 AND severity = 'DANGER'
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const result = await pool.query(query, [driver_id, parseInt(limit)]);
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch critical alerts:', error);
    res.status(500).json({ error: 'Failed to fetch critical alerts' });
  }
};

// GET - Get statistics
export const getStats = async (req, res) => {
  const { driver_id } = req.query;
  
  if (!driver_id) {
    return res.status(400).json({ error: 'driver_id is required' });
  }
  
  try {
    const query = `
      SELECT 
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN severity = 'DANGER' THEN 1 END) as danger_count,
        COUNT(CASE WHEN severity = 'WARNING' THEN 1 END) as warning_count,
        COUNT(CASE WHEN alert_type = 'drowsy' THEN 1 END) as drowsy_count,
        COUNT(CASE WHEN alert_type = 'phone_use' THEN 1 END) as phone_count,
        COUNT(CASE WHEN alert_type = 'looking_away' THEN 1 END) as distracted_count,
        COUNT(CASE WHEN alert_type = 'yawning' THEN 1 END) as yawning_count
      FROM driver_monitoring 
      WHERE driver_id = $1 
        AND created_at > NOW() - INTERVAL '24 hours'
    `;
    
    const result = await pool.query(query, [driver_id]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};
