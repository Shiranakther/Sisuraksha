import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';

const normalizeDate = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid date supplied.', 400);
  }
  const utcMidnight = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return utcMidnight.toISOString().slice(0, 10); // YYYY-MM-DD
};

/**
 * CREATE / MARK attendance (Supabase/PostgreSQL)
 */
export const markAttendance = async (req, res, next) => {
  try {
    const {
      motherId,
      childName,
      wentToSchool,
      morningBus,
      cameBackHome,
      eveningBus,
      schoolLatitude,
      schoolLongitude,
      homeLatitude,
      homeLongitude,
    } = req.body;

    if (!motherId || !childName) {
      return next(new AppError('motherId and childName are required.', 400));
    }

    const attendanceDate = normalizeDate();

    const query = `
      INSERT INTO attendance (
        mother_id,
        child_name,
        date,
        went_to_school,
        morning_bus,
        came_back_home,
        evening_bus,
        school_latitude,
        school_longitude,
        home_latitude,
        home_longitude
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (mother_id, child_name, date)
      DO UPDATE SET
        went_to_school = COALESCE(EXCLUDED.went_to_school, attendance.went_to_school),
        morning_bus = COALESCE(EXCLUDED.morning_bus, attendance.morning_bus),
        came_back_home = COALESCE(EXCLUDED.came_back_home, attendance.came_back_home),
        evening_bus = COALESCE(EXCLUDED.evening_bus, attendance.evening_bus),
        school_latitude = COALESCE(EXCLUDED.school_latitude, attendance.school_latitude),
        school_longitude = COALESCE(EXCLUDED.school_longitude, attendance.school_longitude),
        home_latitude = COALESCE(EXCLUDED.home_latitude, attendance.home_latitude),
        home_longitude = COALESCE(EXCLUDED.home_longitude, attendance.home_longitude),
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      motherId,
      childName,
      attendanceDate,
      Boolean(wentToSchool) || false,
      Boolean(morningBus) || false,
      Boolean(cameBackHome) || false,
      Boolean(eveningBus) || false,
      schoolLatitude || null,
      schoolLongitude || null,
      homeLatitude || null,
      homeLongitude || null,
    ];

    const { rows } = await pgPool.query(query, values);

    res.status(200).json({
      success: true,
      message: 'Attendance marked successfully',
      data: rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * READ all attendance for a mother
 */
export const getAttendanceByMother = async (req, res, next) => {
  try {
    const { motherId } = req.params;

    if (!motherId) {
      return next(new AppError('motherId is required.', 400));
    }

    const { rows } = await pgPool.query(
      `SELECT * FROM attendance WHERE mother_id = $1 ORDER BY date DESC`,
      [motherId]
    );

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * READ attendance by date
 */
export const getAttendanceByDate = async (req, res, next) => {
  try {
    const { motherId, date } = req.params;

    if (!motherId || !date) {
      return next(new AppError('motherId and date are required.', 400));
    }

    const selectedDate = normalizeDate(date);

    const { rows } = await pgPool.query(
      `SELECT * FROM attendance WHERE mother_id = $1 AND date = $2`,
      [motherId, selectedDate]
    );

    res.status(200).json({
      success: true,
      data: rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE attendance record
 */
export const deleteAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pgPool.query('SELECT * FROM attendance WHERE id = $1 LIMIT 1', [id]);

    if (!existing.rowCount) {
      return next(new AppError('Attendance not found.', 404));
    }

    const record = existing.rows[0];
    const today = normalizeDate();
    const recordDate = normalizeDate(record.date);

    if (recordDate !== today) {
      return next(new AppError('Only today\'s attendance can be deleted.', 403));
    }

    if (Object.prototype.hasOwnProperty.call(record, 'driver_approved') && record.driver_approved) {
      return next(new AppError('Attendance cannot be deleted after driver approval.', 403));
    }

    await pgPool.query('DELETE FROM attendance WHERE id = $1', [id]);

    res.status(200).json({
      success: true,
      message: 'Attendance deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * READ attendance for driver (all mothers with bus requests)
 */
export const getTodayAttendanceForDriver = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        id,
        mother_id,
        child_name,
        date,
        went_to_school,
        morning_bus,
        came_back_home,
        evening_bus,
        school_latitude,
        school_longitude,
        home_latitude,
        home_longitude,
        created_at,
        updated_at
      FROM attendance;
    `;

    const { rows } = await pgPool.query(query);

    const morningBusRequests = rows.filter(row => row.morning_bus);
    const eveningBusRequests = rows.filter(row => row.evening_bus);

    res.status(200).json({
      success: true,
      totalRecords: rows.length,
      morningBusCount: morningBusRequests.length,
      eveningBusCount: eveningBusRequests.length,
      data: {
        all: rows,
        morningBus: morningBusRequests,
        eveningBus: eveningBusRequests,
      },
    });
  } catch (error) {
    next(error);
  }
};
