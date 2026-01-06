import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js';
import { addToBlockchain } from '../service/blockchainService.js';
import { sendPushNotification } from '../service/notificationService.js'; // Ensure this is imported

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
        next(err); 
    }
};

export const syncIoTDevice = async (req, res, next) => {
    try {
        const { cardUid, lat, lon, deviceTime } = req.body;

        const cmdRes = await pgPool.query('SELECT * FROM iot_device_commands WHERE id = 1');
        if (cmdRes.rowCount === 0) return next(new AppError('IoT command configuration missing', 500));
        const currentCmd = cmdRes.rows[0];

        if (!cardUid) {
            return res.status(200).json({ status: 'idle', mode: currentCmd.command });
        }

        //  REGISTRATION MODE 
        if (currentCmd.command === 'REGISTRATION') {
            const childId = currentCmd.target_child_id;
            if (!childId) return next(new AppError('No target child set', 400));

            await pgPool.query('INSERT INTO public.card (id, is_active) VALUES ($1, true) ON CONFLICT (id) DO UPDATE SET is_active = true', [cardUid]);
            const childUpdate = await pgPool.query('UPDATE public.children SET card_id = $1 WHERE id = $2', [cardUid, childId]);
            
            if (childUpdate.rowCount === 0) return next(new AppError('Child not found', 404));

            await pgPool.query("UPDATE iot_device_commands SET command = 'IDLE', target_child_id = NULL WHERE id = 1");
            return res.status(200).json({ status: 'success', message: 'Card linked', mode: 'IDLE' });
        }

        //  ATTENDANCE MODE 
        const childRes = await pgPool.query('SELECT * FROM public.children WHERE card_id = $1', [cardUid]);
        if (childRes.rowCount === 0) return next(new AppError('Unknown card', 404));

        const child = childRes.rows[0];
        const today = new Date().toISOString().split('T')[0];
        
        // Determine the time to record: Use GPS time if available, otherwise server time
        const recordTime = deviceTime ? new Date(deviceTime).toTimeString().split(' ')[0] : new Date().toTimeString().split(' ')[0];

        const attCheck = await pgPool.query('SELECT * FROM public.attendance WHERE child_id = $1 AND date = $2', [child.id, today]);

        // MORNING PICKUP
        if (attCheck.rowCount === 0) {
            await pgPool.query(
                `INSERT INTO public.attendance
                 (child_id, card_id, date, morning_pickup_time, morning_pickup_lat, morning_pickup_lon, last_action, school_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'MORNING_PICKUP', $7)`,
                [child.id, cardUid, today, recordTime, lat, lon, child.school_id]
            );
 -
            await addToBlockchain(child.id, 'MORNING_PICKUP', { lat, lon }, deviceTime);

            return res.status(201).json({ status: 'success', stage: 'Morning Pickup', mode: 'IDLE' });
        }

        // SUBSEQUENT STAGES (Morning Drop, Evening Pickup/Drop)
        const att = attCheck.rows[0];
        let timeField, latField, lonField, action;

        if (!att.morning_drop_time) {
            timeField = 'morning_drop_time'; latField = 'morning_drop_lat'; lonField = 'morning_drop_lon'; action = 'MORNING_DROP';
        } else if (!att.evening_pickup_time) {
            timeField = 'evening_pickup_time'; latField = 'evening_pickup_lat'; lonField = 'evening_pickup_lon'; action = 'EVENING_PICKUP';
        } else if (!att.evening_drop_time) {
            timeField = 'evening_drop_time'; latField = 'evening_drop_lat'; lonField = 'evening_drop_lon'; action = 'EVENING_DROP';
        }

        if (!timeField) return res.status(200).json({ status: 'done', message: 'Day Finished', mode: 'IDLE' });

        await pgPool.query(
            `UPDATE public.attendance SET ${timeField} = $1, ${latField} = $2, ${lonField} = $3, last_action = $4, updated_at = NOW() WHERE id = $5`,
            [recordTime, lat, lon, action, att.id]
        );

        await addToBlockchain(child.id, action, { lat, lon }, deviceTime);

        res.status(200).json({ status: 'success', stage: action.replace('_', ' '), mode: 'IDLE' });

    } catch (err) { next(err); }
};


