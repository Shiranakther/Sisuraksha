import { pool } from '../config/postgres.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store last heartbeat time in memory (per driver)
const driverHeartbeats = new Map();

// Store system enabled state (per driver) - controls whether alerts are processed
const driverSystemEnabled = new Map();

// Store running model processes (per driver)
const modelProcesses = new Map();

// Model configuration
const MODEL_CONFIG = {
  pythonPath: path.join(__dirname, '../../footboard safety/myenv/myenv/Scripts/python.exe'),
  scriptPath: path.join(__dirname, '../../footboard safety/riyabeth_pro_safety.py'),
  cwd: path.join(__dirname, '../../footboard safety')
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
        message: 'Model is already running',
        pid: existingProcess.pid 
      });
    }
  }
  
  try {
    console.log(`🚀 Starting model for driver ${driverId}...`);
    console.log(`📁 Python: ${MODEL_CONFIG.pythonPath}`);
    console.log(`📁 Script: ${MODEL_CONFIG.scriptPath}`);
    console.log(`📁 CWD: ${MODEL_CONFIG.cwd}`);
    
    const modelProcess = spawn(MODEL_CONFIG.pythonPath, [MODEL_CONFIG.scriptPath], {
      cwd: MODEL_CONFIG.cwd,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    modelProcess.stdout.on('data', (data) => {
      console.log(`[Model ${driverId}] ${data.toString().trim()}`);
    });
    
    modelProcess.stderr.on('data', (data) => {
      console.error(`[Model ${driverId} ERR] ${data.toString().trim()}`);
    });
    
    modelProcess.on('close', (code) => {
      console.log(`[Model ${driverId}] Process exited with code ${code}`);
      modelProcesses.delete(driverId);
    });
    
    modelProcess.on('error', (err) => {
      console.error(`[Model ${driverId}] Error: ${err.message}`);
      modelProcesses.delete(driverId);
    });
    
    modelProcesses.set(driverId, modelProcess);
    driverSystemEnabled.set(driverId, true);
    
    res.json({ 
      success: true, 
      running: true, 
      message: 'Model started successfully',
      pid: modelProcess.pid 
    });
  } catch (error) {
    console.error('Error starting model:', error);
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
      message: 'Model is not running' 
    });
  }
  
  try {
    console.log(`🛑 Stopping model for driver ${driverId} (PID: ${modelProcess.pid})...`);
    
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
      message: 'Model stopped successfully' 
    });
  } catch (error) {
    console.error('Error stopping model:', error);
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
  const isEnabled = driverSystemEnabled.get(driverId) !== false; // Default to true
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
  console.log(`🔄 System ${enabled ? 'ENABLED' : 'DISABLED'} for driver ${driverId}`);
  
  res.json({
    success: true,
    enabled: enabled,
    driver_id: driverId,
    message: `Safety system ${enabled ? 'enabled' : 'disabled'}`
  });
};

// POST - Receive alert from model
export const createAlert = async (req, res) => {
  try {
    const { driver_id, timestamp, alert_type, status, speed, confidence, message, sound } = req.body;
    const driverId = driver_id || 'default';
    
    // Check if system is enabled for this driver
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
        alert_type,
        status,
        speed || 0,
        confidence || 0,
        message,
        sound || false  // Default to false if not provided
      ]
    );
    
    console.log(`📥 Safety Alert: ${alert_type} - ${status} (${speed} km/h)`);
    
    // Update heartbeat on any alert
    driverHeartbeats.set(driverId, new Date());
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error saving alert:', error);
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

// GET - Fetch only critical/danger alerts
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

// GET - Stats summary
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
