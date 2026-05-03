import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';
import { sendPushNotification } from '../service/notificationService.js';
import {
  sendEmail,
  buildAccidentEmailHtml,
  buildCancelEmailHtml,
} from '../service/emailService.js';

// ─── Door ESP32 Config ──────────────────────────────────────────────────────
// Accident ESP32 triggers /open directly. Backend only polls status and resets.
const DOOR_ESP32_URL = process.env.DOOR_ESP32_URL || 'http://192.168.1.83';

const latestAccidentLiveState = new Map();
const accidentCancelCommands = new Map();

function getNewestAccidentLiveState() {
  let newest = null;
  for (const state of latestAccidentLiveState.values()) {
    if (!newest) {
      newest = state;
      continue;
    }

    const stateTime = new Date(state.updated_at || 0).getTime();
    const newestTime = new Date(newest.updated_at || 0).getTime();
    if (stateTime > newestTime) {
      newest = state;
    }
  }
  return newest;
}

// ─── Door ESP32 helpers ─────────────────────────────────────────────────────

async function triggerDoorReset() {
  try {
    const resp = await fetch(`${DOOR_ESP32_URL}/reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    const data = await resp.json();
    console.log(`[DOOR] Reset triggered: ${data.status}`);
  } catch (e) {
    console.error('[DOOR] Failed to trigger door reset:', e.message);
  }
}

// ─── Shared: resolve driver + vehicle by email ─────────────────────────────

async function resolveDriverByEmail(email) {
  const res = await pgPool.query(
    `SELECT v.id AS vehicle_id, v.vehicle_number, v.driver_id,
            u.first_name, u.last_name, u.email AS driver_email
     FROM public.users  u
     JOIN public.driver  d ON d.user_id = u.id
     LEFT JOIN public.vehicles v ON v.driver_id = d.id
     WHERE u.email = $1
     LIMIT 1`,
    [email]
  );
  return res.rows[0] || null;
}

async function resolveDriverById(driverId) {
  const res = await pgPool.query(
    `SELECT v.id AS vehicle_id, v.vehicle_number, v.driver_id,
            u.first_name, u.last_name, u.email AS driver_email
     FROM public.driver d
     JOIN public.users u ON d.user_id = u.id
     LEFT JOIN public.vehicles v ON v.driver_id = d.id
     WHERE d.id = $1
     LIMIT 1`,
    [driverId]
  );
  return res.rows[0] || null;
}

async function resolveDriverFromPayload({ driverEmail, driver_id }) {
  if (driver_id) return resolveDriverById(driver_id);
  if (driverEmail) return resolveDriverByEmail(driverEmail);
  return null;
}

// ─── Shared: find all parents for a given driver ────────────────────────────

async function getParentsForDriver(driverId) {
  const res = await pgPool.query(
    `SELECT DISTINCT
       u.id        AS user_id,
       u.email,
       u.first_name,
       u.last_name,
       u.push_token,
       c.child_name
     FROM public.children c
     JOIN public.parent p ON c.parent_id = p.id
     JOIN public.users  u ON p.user_id   = u.id
     WHERE c.assigned_driver_id = $1`,
    [driverId]
  );
  return res.rows; // each row = one parent-child pair (parent may appear multiple times with different children)
}

// ─── Shared: get driver's last known GPS ────────────────────────────────────

async function getDriverLocation(driverId) {
  // Try live location first, then fall back to trip start coordinates
  const live = await pgPool.query(
    `SELECT latitude, longitude FROM public.driver_live_location
     WHERE driver_id = $1 AND latitude != 0 AND longitude != 0`,
    [driverId]
  );
  if (live.rowCount > 0) return live.rows[0];

  const trip = await pgPool.query(
    `SELECT trip_start_latitude AS latitude, trip_start_longitude AS longitude
     FROM public.driver WHERE id = $1`,
    [driverId]
  );
  if (trip.rowCount > 0 && trip.rows[0].latitude) return trip.rows[0];

  return { latitude: null, longitude: null };
}

// ─── Shared: fan-out notifications to all parents ───────────────────────────

async function notifyParents(driverId, alertData) {
  const parents = await getParentsForDriver(driverId);
  if (parents.length === 0) {
    console.warn('[ACCIDENT] No parents found for driver', driverId);
    return;
  }

  const { alertType, status, confidence, driverName, vehicleNumber, locationLat, locationLon } = alertData;
  const timestamp = new Date().toLocaleString('en-LK', { timeZone: 'Asia/Colombo' });

  const pushTitle = status === 'CONFIRMED'
    ? '🚨 EMERGENCY — Accident Confirmed!'
    : '⚠️ Accident Alert — Bus Incident Detected';

  const pushBody = status === 'CONFIRMED'
    ? `A ${alertType} has been confirmed on bus ${vehicleNumber}. Emergency services notified.`
    : `A possible ${alertType} detected on bus ${vehicleNumber} (${confidence}% confidence). Driver has 3 min to cancel.`;

  // Deduplicate parents (same parent may have multiple children on the bus)
  const seen = new Set();
  const uniqueParents = [];
  for (const p of parents) {
    if (!seen.has(p.user_id)) {
      seen.add(p.user_id);
      // Collect all child names for this parent
      const childNames = parents
        .filter(r => r.user_id === p.user_id)
        .map(r => r.child_name);
      uniqueParents.push({ ...p, childNames });
    }
  }

  // Send push + email in parallel per parent
  const tasks = uniqueParents.map(async (parent) => {
    const childNameStr = parent.childNames.join(', ');

    // ── Push notification ──
    if (parent.push_token) {
      try {
        await sendPushNotification(parent.push_token, pushTitle, pushBody, {
          type: 'ACCIDENT_ALERT',
          alertType,
          status,
          vehicleNumber,
          driverId,
        });
      } catch (e) {
        console.error(`[ACCIDENT] Push failed for ${parent.email}:`, e.message);
      }
    }

    // ── Email ──
    if (parent.email) {
      try {
        const html = buildAccidentEmailHtml({
          parentName: parent.first_name || 'Parent',
          childName: childNameStr,
          driverName,
          vehicleNumber,
          alertType,
          confidence: confidence?.toFixed(1) || '—',
          status,
          locationLat,
          locationLon,
          timestamp,
        });
        const subject = status === 'CONFIRMED'
          ? `🚨 EMERGENCY: Accident confirmed on bus ${vehicleNumber}`
          : `⚠️ Accident alert on bus ${vehicleNumber}`;
        await sendEmail(parent.email, subject, html);
      } catch (e) {
        console.error(`[ACCIDENT] Email failed for ${parent.email}:`, e.message);
      }
    }
  });

  await Promise.allSettled(tasks);
  console.log(`[ACCIDENT] Notified ${uniqueParents.length} parents (status=${status})`);
}

// ─── Shared: send cancellation notifications ────────────────────────────────

async function notifyCancellation(driverId, driverName, vehicleNumber) {
  const parents = await getParentsForDriver(driverId);
  if (parents.length === 0) return;

  const seen = new Set();
  const uniqueParents = [];
  for (const p of parents) {
    if (!seen.has(p.user_id)) {
      seen.add(p.user_id);
      const childNames = parents
        .filter(r => r.user_id === p.user_id)
        .map(r => r.child_name);
      uniqueParents.push({ ...p, childNames });
    }
  }

  const tasks = uniqueParents.map(async (parent) => {
    const childNameStr = parent.childNames.join(', ');

    if (parent.push_token) {
      try {
        await sendPushNotification(
          parent.push_token,
          '✅ Alert Cancelled — All Clear',
          `The accident alert on bus ${vehicleNumber} was a false alarm. Your child ${childNameStr} is safe.`,
          { type: 'ACCIDENT_CANCELLED', vehicleNumber }
        );
      } catch (e) {
        console.error(`[ACCIDENT] Cancel push failed for ${parent.email}:`, e.message);
      }
    }

    if (parent.email) {
      try {
        const html = buildCancelEmailHtml({
          parentName: parent.first_name || 'Parent',
          childName: childNameStr,
          driverName,
          vehicleNumber,
        });
        await sendEmail(parent.email, `✅ Alert cancelled — bus ${vehicleNumber} all clear`, html);
      } catch (e) {
        console.error(`[ACCIDENT] Cancel email failed for ${parent.email}:`, e.message);
      }
    }
  });

  await Promise.allSettled(tasks);
  console.log(`[ACCIDENT] Cancellation sent to ${uniqueParents.length} parents`);
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/accident/alert
// Called by ESP32 when accident PENDING or CONFIRMED
// ═════════════════════════════════════════════════════════════════════════════

export const receiveAlert = async (req, res, next) => {
  try {
    const { driverEmail, driver_id, alertType, status, confidence, evidence, sensorData } = req.body;

    if ((!driverEmail && !driver_id) || !alertType || !status) {
      return next(new AppError('driverEmail or driver_id, alertType and status are required', 400));
    }

    // 1. Resolve driver by email
    const driver = await resolveDriverFromPayload({ driverEmail, driver_id });
    if (!driver) {
      console.error('[ACCIDENT] No driver found for payload:', { driverEmail, driver_id });
      return next(new AppError('No driver found for the given driver identity', 404));
    }

    const driverName = `${driver.first_name || ''} ${driver.last_name || ''}`.trim() || 'Unknown Driver';
    const vehicleNumber = driver.vehicle_number;

    // 2. Dedup — ignore duplicate PENDING alerts within 30s
    if (status === 'PENDING') {
      const recent = await pgPool.query(
        `SELECT id FROM public.accident_alerts
         WHERE driver_id = $1 AND status = 'PENDING'
           AND created_at > NOW() - INTERVAL '30 seconds'
         LIMIT 1`,
        [driver.driver_id]
      );
      if (recent.rowCount > 0) {
        return res.status(200).json({ message: 'Duplicate PENDING ignored', alertId: recent.rows[0].id });
      }
    }

    // 3. Get driver location
    const loc = await getDriverLocation(driver.driver_id);

    // 4. Insert alert record
    const insertRes = await pgPool.query(
      `INSERT INTO public.accident_alerts
         (driver_id, bus_id, alert_type, status, confidence, evidence, sensor_data,
          location_lat, location_lon, notified_at,
          resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW(),
               ${status === 'CONFIRMED' ? 'NOW()' : 'NULL'})
       RETURNING id`,
      [
        driver.driver_id,
        vehicleNumber,
        alertType,
        status,
        confidence || null,
        evidence || null,
        sensorData ? JSON.stringify(sensorData) : null,
        loc.latitude,
        loc.longitude,
      ]
    );

    const alertId = insertRes.rows[0].id;
    console.log(`[ACCIDENT] Alert #${alertId} created: ${alertType} (${status}) vehicle=${vehicleNumber}`);

    // 5. If CONFIRMED, also update any existing PENDING to CONFIRMED
    if (status === 'CONFIRMED') {
      await pgPool.query(
        `UPDATE public.accident_alerts
         SET status = 'CONFIRMED', resolved_at = NOW()
         WHERE driver_id = $1 AND status = 'PENDING' AND id != $2`,
        [driver.driver_id, alertId]
      );

      // Door opening is commanded directly by the accident ESP32.
      // Backend keeps door status/reset visibility for the app.
    }

    // 6. Notify all parents (async — don't block ESP32 response)
    notifyParents(driver.driver_id, {
      alertType,
      status,
      confidence,
      driverName,
      vehicleNumber,
      locationLat: loc.latitude,
      locationLon: loc.longitude,
    }).catch(err => console.error('[ACCIDENT] Notification fan-out error:', err));

    res.status(201).json({
      message: `Alert ${status} recorded`,
      alertId,
      driverId: driver.driver_id,
    });

  } catch (error) {
    console.error('[ACCIDENT] receiveAlert error:', error);
    next(error instanceof AppError ? error : new AppError('Server error processing accident alert', 500));
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/accident/cancel
// Called by ESP32 when driver presses cancel button within 3 min
// ═════════════════════════════════════════════════════════════════════════════

export const cancelAlert = async (req, res, next) => {
  try {
    const { driverEmail, driver_id } = req.body;

    if (!driverEmail && !driver_id) {
      return next(new AppError('driverEmail or driver_id is required', 400));
    }

    const driver = await resolveDriverFromPayload({ driverEmail, driver_id });
    if (!driver) {
      return next(new AppError('No driver found for the given driver identity', 404));
    }

    const driverName = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();

    // Update all PENDING alerts for this driver to CANCELLED
    const result = await pgPool.query(
      `UPDATE public.accident_alerts
       SET status = 'CANCELLED', resolved_at = NOW()
       WHERE driver_id = $1 AND status = 'PENDING'
       RETURNING id`,
      [driver.driver_id]
    );

    if (result.rowCount === 0) {
      return res.status(200).json({ message: 'No pending alerts to cancel' });
    }

    console.log(`[ACCIDENT] Cancelled ${result.rowCount} alert(s) for driver ${driver.driver_id}`);

    // Notify parents — false alarm
    notifyCancellation(driver.driver_id, driverName, driver.vehicle_number)
      .catch(err => console.error('[ACCIDENT] Cancel notification error:', err));

    // Reset door ESP32 — false alarm, close door
    triggerDoorReset()
      .catch(err => console.error('[DOOR] Door reset error:', err));

    res.status(200).json({
      message: 'Alert cancelled',
      cancelledCount: result.rowCount,
    });

  } catch (error) {
    console.error('[ACCIDENT] cancelAlert error:', error);
    next(error instanceof AppError ? error : new AppError('Server error cancelling alert', 500));
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/accident/active
// For parent/driver apps — get any active (PENDING/CONFIRMED) alerts
// ═════════════════════════════════════════════════════════════════════════════

export const cancelActiveAlertFromApp = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const driverRes = await pgPool.query(
      `SELECT d.id AS driver_id, v.vehicle_number, u.first_name, u.last_name
       FROM public.driver d
       JOIN public.users u ON d.user_id = u.id
       LEFT JOIN public.vehicles v ON v.driver_id = d.id AND v.is_active = true
       WHERE d.user_id = $1
       LIMIT 1`,
      [userId]
    );

    if (driverRes.rowCount === 0) {
      return next(new AppError('Driver profile not found for this user', 404));
    }

    const driver = driverRes.rows[0];
    const driverName = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();

    const command = {
      requestedAt: new Date().toISOString(),
      source: 'driver_app',
    };
    accidentCancelCommands.set(driver.driver_id, command);

    const result = await pgPool.query(
      `UPDATE public.accident_alerts
       SET status = 'CANCELLED', resolved_at = NOW()
       WHERE driver_id = $1 AND status = 'PENDING'
       RETURNING id`,
      [driver.driver_id]
    );

    if (result.rowCount > 0) {
      notifyCancellation(driver.driver_id, driverName, driver.vehicle_number)
        .catch(err => console.error('[ACCIDENT] App cancel notification error:', err));
      triggerDoorReset()
        .catch(err => console.error('[DOOR] Door reset error:', err));
    }

    const live = latestAccidentLiveState.get(driver.driver_id) || getNewestAccidentLiveState();
    if (live) {
      const liveDriverId = live.driver_id || driver.driver_id;
      accidentCancelCommands.set(liveDriverId, command);
      latestAccidentLiveState.set(liveDriverId, {
        ...live,
        alert_active: false,
        remaining_seconds: 0,
        cancelled_from_app: true,
        updated_at: new Date().toISOString(),
      });
    }

    res.json({
      status: 'success',
      message: 'Accident countdown stop requested',
      cancelledCount: result.rowCount,
    });
  } catch (error) {
    console.error('[ACCIDENT] cancelActiveAlertFromApp error:', error);
    next(error instanceof AppError ? error : new AppError('Server error cancelling active accident alert', 500));
  }
};

export const receiveLiveState = async (req, res) => {
  const driverId = req.body.driver_id || 'default';
  const state = {
    ...req.body,
    driver_id: driverId,
    online: true,
    updated_at: new Date().toISOString(),
  };

  latestAccidentLiveState.set(driverId, state);
  console.log(
    `[ACCIDENT-LIVE] driver=${driverId} alert=${state.alert_active ? 'YES' : 'NO'} ` +
    `type=${state.alert_type || 'NONE'} remaining=${state.remaining_seconds ?? 0}`
  );
  res.status(200).json({ status: 'success', data: state });
};

export const getLiveState = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let driverIds = [];
    if (role === 'Driver') {
      const d = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
      if (d.rowCount > 0) driverIds = [d.rows[0].id];
    } else {
      const p = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [userId]);
      if (p.rowCount > 0) {
        const children = await pgPool.query(
          'SELECT DISTINCT assigned_driver_id FROM public.children WHERE parent_id = $1 AND assigned_driver_id IS NOT NULL',
          [p.rows[0].id]
        );
        driverIds = children.rows.map(r => r.assigned_driver_id);
      }
    }

    let state = driverIds
      .map(driverId => latestAccidentLiveState.get(driverId))
      .find(Boolean) || null;

    if (!state) {
      state = getNewestAccidentLiveState();
    }

    res.json({ status: 'success', data: state });
  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Error fetching accident live state', 500));
  }
};

export const getDeviceCommand = (req, res) => {
  const driverId = req.query.driver_id || 'default';
  const command = accidentCancelCommands.get(driverId);
  const cancelRequested = !!command;

  if (cancelRequested) {
    accidentCancelCommands.delete(driverId);
  }

  res.json({
    status: 'success',
    cancelRequested,
    command: cancelRequested ? command : null,
  });
};

export const getActiveAlerts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let driverIds = [];

    if (role === 'Driver') {
      // Driver sees their own alerts
      const d = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
      if (d.rowCount > 0) driverIds = [d.rows[0].id];
    } else {
      // Parent sees alerts for drivers assigned to their children
      const p = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [userId]);
      if (p.rowCount > 0) {
        const children = await pgPool.query(
          'SELECT DISTINCT assigned_driver_id FROM public.children WHERE parent_id = $1 AND assigned_driver_id IS NOT NULL',
          [p.rows[0].id]
        );
        driverIds = children.rows.map(r => r.assigned_driver_id);
      }
    }

    if (driverIds.length === 0) {
      return res.json({ status: 'success', data: [] });
    }

    const result = await pgPool.query(
      `SELECT a.*,
              u.first_name AS driver_first_name,
              u.last_name  AS driver_last_name,
              v.vehicle_number
       FROM public.accident_alerts a
       JOIN public.driver d ON a.driver_id = d.id
       JOIN public.users  u ON d.user_id = u.id
       LEFT JOIN public.vehicles v ON v.driver_id = d.id AND v.is_active = true
       WHERE a.driver_id = ANY($1)
         AND a.status IN ('PENDING', 'CONFIRMED')
         AND a.created_at > NOW() - INTERVAL '24 hours'
       ORDER BY a.created_at DESC`,
      [driverIds]
    );

    res.json({ status: 'success', data: result.rows });

  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Error fetching active alerts', 500));
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/accident/history
// Past accident records (all statuses)
// ═════════════════════════════════════════════════════════════════════════════

export const getAlertHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const limit = parseInt(req.query.limit) || 20;

    let driverIds = [];

    if (role === 'Driver') {
      const d = await pgPool.query('SELECT id FROM public.driver WHERE user_id = $1', [userId]);
      if (d.rowCount > 0) driverIds = [d.rows[0].id];
    } else {
      const p = await pgPool.query('SELECT id FROM public.parent WHERE user_id = $1', [userId]);
      if (p.rowCount > 0) {
        const children = await pgPool.query(
          'SELECT DISTINCT assigned_driver_id FROM public.children WHERE parent_id = $1 AND assigned_driver_id IS NOT NULL',
          [p.rows[0].id]
        );
        driverIds = children.rows.map(r => r.assigned_driver_id);
      }
    }

    if (driverIds.length === 0) {
      return res.json({ status: 'success', data: [] });
    }

    const result = await pgPool.query(
      `SELECT a.id, a.alert_type, a.status, a.confidence, a.evidence,
              a.location_lat, a.location_lon,
              a.created_at, a.resolved_at,
              u.first_name AS driver_first_name,
              u.last_name  AS driver_last_name,
              v.vehicle_number
       FROM public.accident_alerts a
       JOIN public.driver d ON a.driver_id = d.id
       JOIN public.users  u ON d.user_id = u.id
       LEFT JOIN public.vehicles v ON v.driver_id = d.id AND v.is_active = true
       WHERE a.driver_id = ANY($1)
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [driverIds, limit]
    );

    res.json({ status: 'success', data: result.rows });

  } catch (error) {
    next(error instanceof AppError ? error : new AppError('Error fetching alert history', 500));
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// In-memory door state — updated by door ESP32 callback, read by app polling
// ═════════════════════════════════════════════════════════════════════════════

let latestDoorState = {
  state: 'OFFLINE',
  doorOpen: false,
  pirBlocked: false,
  pirClear: false,
  busId: '',
  accidentType: '',
  updatedAt: null,
};

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/accident/door-callback
// Called by Door ESP32 on every state change — updates in-memory state
// No auth — ESP32 posts directly (same as /alert and /cancel)
// ═════════════════════════════════════════════════════════════════════════════

export const doorCallback = async (req, res) => {
  const { state, doorOpen, pirBlocked, pirClear, busId, accidentType } = req.body;

  if (!state) {
    return res.status(400).json({ status: 'fail', message: 'state is required' });
  }

  latestDoorState = {
    state,
    doorOpen: !!doorOpen,
    pirBlocked: !!pirBlocked,
    pirClear: !!pirClear,
    busId: busId || '',
    accidentType: accidentType || '',
    updatedAt: new Date().toISOString(),
  };

  console.log(`[DOOR-CB] State update: ${state} | door=${doorOpen ? 'OPEN' : 'LOCKED'} | pir=${pirBlocked ? 'BLOCKED' : 'CLEAR'}`);

  res.json({ status: 'success', message: 'Door state updated' });
};

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/accident/door-status
// Returns latest door state — tries in-memory first, falls back to ESP32 poll
// ═════════════════════════════════════════════════════════════════════════════

export const getDoorStatus = async (req, res, next) => {
  // If we have a recent callback (< 10s old), use in-memory state
  if (latestDoorState.updatedAt) {
    const age = Date.now() - new Date(latestDoorState.updatedAt).getTime();
    if (age < 10000) {
      return res.json({ status: 'success', data: latestDoorState });
    }
  }

  // Otherwise fall back to polling ESP32 directly
  try {
    const resp = await fetch(`${DOOR_ESP32_URL}/status`, {
      signal: AbortSignal.timeout(3000),
    });
    const data = await resp.json();
    // Update in-memory cache
    latestDoorState = { ...data, updatedAt: new Date().toISOString() };
    res.json({ status: 'success', data });
  } catch (e) {
    res.json({
      status: 'success',
      data: {
        state: 'OFFLINE',
        doorOpen: false,
        pirBlocked: false,
        pirClear: false,
        busId: '',
        accidentType: '',
        updatedAt: latestDoorState.updatedAt,
      },
    });
  }
};

export const resetDoorFromApp = async (req, res, next) => {
  try {
    const resp = await fetch(`${DOOR_ESP32_URL}/reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    const resetData = await resp.json().catch(() => ({}));

    let statusData = {
      state: 'RESET',
      doorOpen: false,
      pirBlocked: false,
      pirClear: false,
      busId: '',
      accidentType: '',
      message: resetData.message || 'Door reset',
      updatedAt: new Date().toISOString(),
    };

    try {
      const statusResp = await fetch(`${DOOR_ESP32_URL}/status`, {
        signal: AbortSignal.timeout(3000),
      });
      const polled = await statusResp.json();
      statusData = { ...polled, updatedAt: new Date().toISOString() };
    } catch {
      // Keep resetData fallback above.
    }

    latestDoorState = statusData;
    res.json({ status: 'success', data: latestDoorState });
  } catch (error) {
    console.error('[DOOR] Door reset from app failed:', error.message);
    next(new AppError('Failed to reset emergency door', 502));
  }
};
