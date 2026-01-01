import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';

export const triggerRegistration = async (req, res, next) => {
    try {
        const { childId } = req.body;

        if (!childId) {
            return next(new AppError('childId is required for registration', 400));
        }

        const result = await pgPool.query(
            `UPDATE iot_device_commands 
             SET command = $1, target_child_id = $2, updated_at = NOW() 
             WHERE id = 1`,
            ['REGISTRATION', childId]
        );

        if (result.rowCount === 0) {
            return next(new AppError('IoT command record not found', 404));
        }

        res.status(200).json({
            status: 'success',
            message: 'IoT device set to registration mode'
        });

    } catch (err) {
        next(err); // forward to global error handler
    }
};


export const syncIoTDevice = async (req, res, next) => {
    try {
        const { cardUid, lat, lon } = req.body;

        const cmdRes = await pgPool.query(
            'SELECT * FROM iot_device_commands WHERE id = 1'
        );

        if (cmdRes.rowCount === 0) {
            return next(new AppError('IoT command configuration missing', 500));
        }

        const currentCmd = cmdRes.rows[0];

        // Device ping without card
        if (!cardUid) {
            return res.status(200).json({
                status: 'idle',
                mode: currentCmd.command
            });
        }

        //registration
        
        if (currentCmd.command === 'REGISTRATION') {
            const childId = currentCmd.target_child_id;

            if (!childId) {
                return next(new AppError('No target child set for registration', 400));
            }

            await pgPool.query(
                `INSERT INTO public.card (id, is_active) 
                 VALUES ($1, true) 
                 ON CONFLICT (id) DO UPDATE SET is_active = true`,
                [cardUid]
            );

            const childUpdate = await pgPool.query(
                'UPDATE public.children SET card_id = $1 WHERE id = $2',
                [cardUid, childId]
            );

            if (childUpdate.rowCount === 0) {
                return next(new AppError('Child not found for registration', 404));
            }

            await pgPool.query(
                `UPDATE iot_device_commands 
                 SET command = 'IDLE', target_child_id = NULL 
                 WHERE id = 1`
            );

            return res.status(200).json({
                status: 'success',
                message: 'Card linked successfully',
                mode: 'IDLE'
            });
        }

        //attendance mode 

        const childRes = await pgPool.query(
            'SELECT * FROM public.children WHERE card_id = $1',
            [cardUid]
        );

        if (childRes.rowCount === 0) {
            return next(new AppError('Unknown or unregistered card', 404));
        }


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

        //morning pickup

        if (attCheck.rowCount === 0) {
            await pgPool.query(
                `INSERT INTO public.attendance
                 (child_id, card_id, date, morning_pickup_time, morning_pickup_lat, morning_pickup_lon, last_action, school_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'MORNING_PICKUP', $7)`,
                [child.id, cardUid, today, nowTime, lat, lon, child.school_id]
            );

            return res.status(201).json({
                status: 'success',
                stage: 'Morning Pickup',
                mode: 'IDLE'
            });
        }

        const att = attCheck.rows[0];

        let timeField = null;
        let latField = null;
        let lonField = null;
        let action = null;

        if (!att.morning_drop_time) {
            timeField = 'morning_drop_time';
            latField = 'morning_drop_lat';
            lonField = 'morning_drop_lon';
            action = 'MORNING_DROP';
        } else if (!att.evening_pickup_time) {
            timeField = 'evening_pickup_time';
            latField = 'evening_pickup_lat';
            lonField = 'evening_pickup_lon';
            action = 'EVENING_PICKUP';
        } else if (!att.evening_drop_time) {
            timeField = 'evening_drop_time';
            latField = 'evening_drop_lat';
            lonField = 'evening_drop_lon';
            action = 'EVENING_DROP';
        }

        if (!timeField) {
            return res.status(200).json({
                status: 'done',
                message: 'Attendance completed for today',
                mode: 'IDLE'
            });
        }

        await pgPool.query(
            `UPDATE public.attendance
             SET ${timeField} = $1,
                 ${latField} = $2,
                 ${lonField} = $3,
                 last_action = $4,
                 updated_at = NOW()
             WHERE id = $5`,
            [nowTime, lat, lon, action, att.id]
        );

        res.status(200).json({
            status: 'success',
            stage: action.replace('_', ' '),
            mode: 'IDLE'
        });
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
