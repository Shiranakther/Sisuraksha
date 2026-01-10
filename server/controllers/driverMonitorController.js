import { pool } from '../config/postgres.js';
import { spawn } from 'child_process';
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

// Model configuration for driver monitoring
const MODEL_CONFIG = {
  pythonPath: path.join(__dirname, '../../Driver monitering/myenv/Scripts/python.exe'),
  scriptPath: path.join(__dirname, '../../Driver monitering/driver_monitor_v2.py'),
  cwd: path.join(__dirname, '../../Driver monitering')
};

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
  
  try {
    console.log(`🚗 Starting driver monitoring model for driver ${driverId}...`);
    console.log(`📁 Python: ${MODEL_CONFIG.pythonPath}`);
    console.log(`📁 Script: ${MODEL_CONFIG.scriptPath}`);
    console.log(`📁 CWD: ${MODEL_CONFIG.cwd}`);
    
    const modelProcess = spawn(MODEL_CONFIG.pythonPath, [MODEL_CONFIG.scriptPath], {
      cwd: MODEL_CONFIG.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });
    
    modelProcess.stdout.on('data', (data) => {
      console.log(`[Driver Monitor ${driverId}] ${data.toString().trim()}`);
    });
    
    modelProcess.stderr.on('data', (data) => {
      console.error(`[Driver Monitor ${driverId} ERR] ${data.toString().trim()}`);
    });
    
    modelProcess.on('close', (code) => {
      console.log(`[Driver Monitor ${driverId}] Process exited with code ${code}`);
      modelProcesses.delete(driverId);
    });
    
    modelProcess.on('error', (err) => {
      console.error(`[Driver Monitor ${driverId}] Failed to start:`, err);
      modelProcesses.delete(driverId);
    });
    
    modelProcesses.set(driverId, modelProcess);
    
    res.json({ 
      success: true, 
      running: true,
      message: 'Driver monitoring model started successfully',
      pid: modelProcess.pid 
    });
    
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
      modelProcess.kill('SIGTERM');
      
      // Force kill after 3 seconds if still running
      setTimeout(() => {
        if (!modelProcess.killed) {
          modelProcess.kill('SIGKILL');
        }
      }, 3000);
    }
    
    modelProcesses.delete(driverId);
    
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
  const isRunning = modelProcess && !modelProcess.killed;
  
  res.json({
    running: isRunning,
    pid: isRunning ? modelProcess.pid : null
  });
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
