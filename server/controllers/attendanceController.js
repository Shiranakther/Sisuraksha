import { pool as pgPool } from '../config/postgres.js';

export const triggerRegistration = async (req, res) => {
    const { childId } = req.body; 
    try {
        await pgPool.query(
            'UPDATE iot_device_commands SET command = $1, target_child_id = $2, updated_at = NOW() WHERE id = 1',
            ['REGISTRATION', childId]
        );
        res.json({ status: 'success', message: 'IoT device set to registration mode' });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
};



export const syncIoTDevice = async (req, res) => {
    try {
        const { cardUid, lat, lon } = req.body;

        const cmdRes = await pgPool.query('SELECT * FROM iot_device_commands WHERE id = 1');
        const currentCmd = cmdRes.rows[0];

        if (!cardUid) {
            return res.json({ status: 'idle', mode: currentCmd.command });
        }

        // registration

        if (currentCmd.command === 'REGISTRATION') {
            const childId = currentCmd.target_child_id;
            await pgPool.query('INSERT INTO public.card (id, is_active) VALUES ($1, true) ON CONFLICT (id) DO UPDATE SET is_active = true', [cardUid]);
            await pgPool.query('UPDATE public.children SET card_id = $1 WHERE id = $2', [cardUid, childId]);
            await pgPool.query('UPDATE iot_device_commands SET command = \'IDLE\', target_child_id = NULL WHERE id = 1');
            return res.json({ status: 'success', message: 'Linked', mode: 'IDLE' });
        }

        // attendance

        const childRes = await pgPool.query('SELECT * FROM public.children WHERE card_id = $1', [cardUid]);
        if (childRes.rowCount === 0) return res.json({ status: 'error', message: 'Unknown Card', mode: 'IDLE' });

        const child = childRes.rows[0];
        const today = new Date().toISOString().split('T')[0];
        const nowTime = new Date().toTimeString().split(' ')[0];

        const attCheck = await pgPool.query(
            'SELECT * FROM public.attendance WHERE child_id = $1 AND date = $2',
            [child.id, today]
        );

        //  MORNING PICKUP 
        if (attCheck.rowCount === 0) {
            await pgPool.query(
                `INSERT INTO public.attendance 
                (child_id, card_id, date, morning_pickup_time, morning_pickup_lat, morning_pickup_lon, last_action, school_id) 
                VALUES ($1, $2, $3, $4, $5, $6, 'MORNING_PICKUP', $7)`,
                [child.id, cardUid, today, nowTime, lat, lon, child.school_id]
            );
            return res.json({ status: 'success', stage: 'Morning Pickup', mode: 'IDLE' });
        }

        const att = attCheck.rows[0];
        let timeField = null;
        let latField = null;
        let lonField = null;
        let action = 'NONE';

        //  LOGIC GATE WITH COORDINATE MAPPING ---
        if (!att.morning_drop_time) { 
            timeField = 'morning_drop_time'; latField = 'morning_drop_lat'; lonField = 'morning_drop_lon'; action = 'MORNING_DROP'; 
        } 
        else if (!att.evening_pickup_time) { 
            timeField = 'evening_pickup_time'; latField = 'evening_pickup_lat'; lonField = 'evening_pickup_lon'; action = 'EVENING_PICKUP'; 
        } 
        else if (!att.evening_drop_time) { 
            timeField = 'evening_drop_time'; latField = 'evening_drop_lat'; lonField = 'evening_drop_lon'; action = 'EVENING_DROP'; 
        }

        if (timeField) {
            await pgPool.query(
                `UPDATE public.attendance 
                 SET ${timeField} = $1, ${latField} = $2, ${lonField} = $3, last_action = $4, updated_at = NOW() 
                 WHERE id = $5`,
                [nowTime, lat, lon, action, att.id]
            );
            return res.json({ status: 'success', stage: action.replace('_', ' '), mode: 'IDLE' });
        }

        return res.json({ status: 'done', message: 'Day Finished', mode: 'IDLE' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: 'error', message: 'Server error' });
    }
};