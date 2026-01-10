import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * CREATE - Add a new daily present request
 * POST /api/daily-present
 */
export const createDailyPresentRequest = asyncHandler(async (req, res, next) => {
  const {
    go_to_school,
    after_school,
    start_location,
    end_location,
    parent_ID,
    children_ID,
    date,
    school_ID,
    location_ID,
  } = req.body;

  // Validate required fields
  if (!parent_ID || !children_ID || !school_ID) {
    return next(new AppError('parent_ID, children_ID, and school_ID are required', 400));
  }

  const query = `
    INSERT INTO daily_present_request (
      go_to_school_,
      after_school_,
      start_location,
      end_location,
      parent_ID,
      children_ID,
      "Date",
      "School_ID",
      location_ID
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const values = [
    go_to_school ?? false,
    after_school ?? false,
    start_location,
    end_location,
    parent_ID,
    children_ID,
    date || new Date().toISOString().split('T')[0], // Default to today
    school_ID,
    location_ID,
  ];

  const result = await pgPool.query(query, values);

  res.status(201).json({
    success: true,
    message: 'Daily present request created successfully',
    data: result.rows[0],
  });
});

/**
 * READ - Get all daily present requests for a parent
 * GET /api/daily-present/parent/:parentId
 */
export const getDailyPresentByParent = asyncHandler(async (req, res, next) => {
  const { parentId } = req.params;

  if (!parentId) {
    return next(new AppError('Parent ID is required', 400));
  }

  const query = `
    SELECT * FROM daily_present_request
    WHERE parent_ID = $1
    ORDER BY "Date" DESC, created_at DESC
  `;

  const result = await pgPool.query(query, [parentId]);

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
  });
});

/**
 * READ - Get daily present request by ID
 * GET /api/daily-present/:id
 */
export const getDailyPresentById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return next(new AppError('Request ID is required', 400));
  }

  const query = `
    SELECT * FROM daily_present_request
    WHERE id = $1
  `;

  const result = await pgPool.query(query, [id]);

  if (result.rows.length === 0) {
    return next(new AppError('Daily present request not found', 404));
  }

  res.status(200).json({
    success: true,
    data: result.rows[0],
  });
});

/**
 * READ - Get daily present requests by date for a parent
 * GET /api/daily-present/parent/:parentId/date/:date
 */
export const getDailyPresentByDate = asyncHandler(async (req, res, next) => {
  const { parentId, date } = req.params;

  if (!parentId || !date) {
    return next(new AppError('Parent ID and date are required', 400));
  }

  const query = `
    SELECT * FROM daily_present_request
    WHERE parent_ID = $1 AND "Date" = $2
    ORDER BY created_at DESC
  `;

  const result = await pgPool.query(query, [parentId, date]);

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
  });
});

/**
 * READ - Get daily present requests by child
 * GET /api/daily-present/child/:childId
 */
export const getDailyPresentByChild = asyncHandler(async (req, res, next) => {
  const { childId } = req.params;

  if (!childId) {
    return next(new AppError('Child ID is required', 400));
  }

  const query = `
    SELECT * FROM daily_present_request
    WHERE children_ID = $1
    ORDER BY "Date" DESC, created_at DESC
  `;

  const result = await pgPool.query(query, [childId]);

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
  });
});

/**
 * READ - Get today's daily present requests for a school
 * GET /api/daily-present/school/:schoolId/today
 */
export const getTodayPresentBySchool = asyncHandler(async (req, res, next) => {
  const { schoolId } = req.params;
  const today = new Date().toISOString().split('T')[0];

  if (!schoolId) {
    return next(new AppError('School ID is required', 400));
  }

  const query = `
    SELECT * FROM daily_present_request
    WHERE "School_ID" = $1 AND "Date" = $2
    ORDER BY created_at DESC
  `;

  const result = await pgPool.query(query, [schoolId, today]);

  res.status(200).json({
    success: true,
    count: result.rows.length,
    data: result.rows,
  });
});

/**
 * UPDATE - Update a daily present request
 * PUT /api/daily-present/:id
 */
export const updateDailyPresentRequest = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const {
    go_to_school,
    after_school,
    start_location,
    end_location,
    date,
    location_ID,
  } = req.body;

  if (!id) {
    return next(new AppError('Request ID is required', 400));
  }

  // First, check if the request exists
  const checkQuery = 'SELECT * FROM daily_present_request WHERE id = $1';
  const checkResult = await pgPool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    return next(new AppError('Daily present request not found', 404));
  }

  // Build dynamic update query
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (go_to_school !== undefined) {
    updates.push(`go_to_school_ = $${paramCount}`);
    values.push(go_to_school);
    paramCount++;
  }

  if (after_school !== undefined) {
    updates.push(`after_school_ = $${paramCount}`);
    values.push(after_school);
    paramCount++;
  }

  if (start_location !== undefined) {
    updates.push(`start_location = $${paramCount}`);
    values.push(start_location);
    paramCount++;
  }

  if (end_location !== undefined) {
    updates.push(`end_location = $${paramCount}`);
    values.push(end_location);
    paramCount++;
  }

  if (date !== undefined) {
    updates.push(`"Date" = $${paramCount}`);
    values.push(date);
    paramCount++;
  }

  if (location_ID !== undefined) {
    updates.push(`location_ID = $${paramCount}`);
    values.push(location_ID);
    paramCount++;
  }

  if (updates.length === 0) {
    return next(new AppError('No fields to update', 400));
  }

  values.push(id);

  const query = `
    UPDATE daily_present_request
    SET ${updates.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `;

  const result = await pgPool.query(query, values);

  res.status(200).json({
    success: true,
    message: 'Daily present request updated successfully',
    data: result.rows[0],
  });
});

/**
 * DELETE - Delete a daily present request
 * DELETE /api/daily-present/:id
 */
export const deleteDailyPresentRequest = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return next(new AppError('Request ID is required', 400));
  }

  // Check if the request exists
  const checkQuery = 'SELECT * FROM daily_present_request WHERE id = $1';
  const checkResult = await pgPool.query(checkQuery, [id]);

  if (checkResult.rows.length === 0) {
    return next(new AppError('Daily present request not found', 404));
  }

  const query = 'DELETE FROM daily_present_request WHERE id = $1 RETURNING *';
  const result = await pgPool.query(query, [id]);

  res.status(200).json({
    success: true,
    message: 'Daily present request deleted successfully',
    data: result.rows[0],
  });
});

/**
 * DELETE - Delete all daily present requests for a parent
 * DELETE /api/daily-present/parent/:parentId
 */
export const deleteDailyPresentByParent = asyncHandler(async (req, res, next) => {
  const { parentId } = req.params;

  if (!parentId) {
    return next(new AppError('Parent ID is required', 400));
  }

  const query = 'DELETE FROM daily_present_request WHERE parent_ID = $1 RETURNING *';
  const result = await pgPool.query(query, [parentId]);

  if (result.rows.length === 0) {
    return next(new AppError('No daily present requests found for this parent', 404));
  }

  res.status(200).json({
    success: true,
    message: `${result.rows.length} daily present request(s) deleted successfully`,
    count: result.rows.length,
  });
});
