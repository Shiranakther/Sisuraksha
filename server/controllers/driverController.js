import { pool as pgPool } from '../config/postgres.js';
import axios from 'axios';
import AppError from '../utils/appError.js'; 

export const registerDriverProfile = async (req, res, next) => {
    const { 
        user_id, 
        license_number, 
        trip_start_latitude, 
        trip_start_longitude, 
        trip_end_latitude, 
        trip_end_longitude,
        school_ids 
    } = req.body;

    if (!user_id || !license_number || !trip_start_latitude || !trip_start_longitude) {
        return next(new AppError('Missing required registration fields', 400));
    }

    const client = await pgPool.connect();

    try {
        await client.query('BEGIN');

        // Generate Polyline via OSRM 
        let routePolyline;
        try {
            const osrmUrl = `http://router.project-osrm.org/route/v1/driving/${trip_start_longitude},${trip_start_latitude};${trip_end_longitude},${trip_end_latitude}?overview=full&geometries=geojson`;
            const osrmRes = await axios.get(osrmUrl, { timeout: 5000 });
            routePolyline = osrmRes.data.routes[0].geometry.coordinates;
        } catch (err) {
            return next(new AppError('Failed to fetch road route from OSRM', 503));
        }

        // Insert into Driver table
        const driverResult = await client.query(`
            INSERT INTO public.driver (
                user_id, license_number, trip_start_latitude, trip_start_longitude, 
                trip_end_latitude, trip_end_longitude, route_polyline
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
        `, [user_id, license_number, trip_start_latitude, trip_start_longitude, trip_end_latitude, trip_end_longitude, JSON.stringify(routePolyline)]);

        const driverId = driverResult.rows[0].id;

        // Insert multiple schools into driver_schools junction table
        if (school_ids && school_ids.length > 0) {
            const schoolValues = school_ids.map((sId, index) => `('${driverId}', '${sId}', ${index + 1})`).join(',');
            await client.query(`
                INSERT INTO public.driver_schools (driver_id, school_id, visit_order)
                VALUES ${schoolValues}
            `);
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, driverId });

    } catch (error) {
        await client.query('ROLLBACK');
        next(new AppError(error.message, 500));
    } finally {
        client.release();
    }
};