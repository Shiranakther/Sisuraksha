import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';


export const markAttendanceByCard = async (req, res, next) => {
    try {
        const {
            card_id,
            school_id,
            latitude,
            longitude,
            action // MORNING_PICKUP | MORNING_DROP | EVENING_PICKUP | EVENING_DROP
        } = req.body;

        if (!card_id || !school_id || !action) {
            return next(new AppError('card_id, school_id and action are required.', 400));
        }

        // Find child by card
        const childResult = await pgPool.query(
            `
            SELECT id
            FROM child
            WHERE card_id = $1
            `,
            [card_id]
        );

        if (childResult.rowCount === 0) {
            return next(new AppError('Invalid or unregistered card.', 404));
        }

        const child_id = childResult.rows[0].id;

        // Prepare date & time
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toTimeString().split(' ')[0];

        // Decide column to update
        let timeColumn;

        switch (action) {
            case 'MORNING_PICKUP':
                timeColumn = 'morning_pickup_time';
                break;
            case 'MORNING_DROP':
                timeColumn = 'morning_drop_time';
                break;
            case 'EVENING_PICKUP':
                timeColumn = 'evening_pickup_time';
                break;
            case 'EVENING_DROP':
                timeColumn = 'evening_drop_time';
                break;
            default:
                return next(new AppError('Invalid attendance action.', 400));
        }

        // Upsert attendance
        const query = `
            INSERT INTO bus_attendance (
                child_id,
                school_id,
                date,
                ${timeColumn},
                latitude,
                longitude,
                status,
                last_action
            )
            VALUES ($1, $2, $3, $4, $5, $6, true, $7)
            ON CONFLICT (child_id, date)
            DO UPDATE SET
                ${timeColumn} = EXCLUDED.${timeColumn},
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                last_action = EXCLUDED.last_action,
                updated_at = NOW()
            RETURNING *
        `;

        const result = await pgPool.query(query, [
            child_id,
            school_id,
            today,
            now,
            latitude,
            longitude,
            action
        ]);

        res.status(200).json({
            status: 'success',
            message: `Attendance marked successfully (${action})`,
            data: result.rows[0]
        });
    } catch (err) {
        next(err);
    }
};

//get attendance by date 

export const getChildAttendanceByDate = async (req, res, next) => {
    try {
        const { childId } = req.params;
        const { date } = req.query;

        if (!date) {
            return next(new AppError('Date is required.', 400));
        }

        const result = await pgPool.query(
            `
            SELECT *
            FROM bus_attendance
            WHERE child_id = $1
            AND date = $2
            `,
            [childId, date]
        );

        res.status(200).json({
            status: 'success',
            data: result.rows[0] || null
        });
    } catch (err) {
        next(err);
    }
};
