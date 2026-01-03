import { pool as pgPool } from '../config/postgres.js';
import AppError from '../utils/appError.js'; 

function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculatePointToSegmentDistance(pLat, pLon, sLat, sLon, eLat, eLon) {
    const y = pLat, x = pLon;
    const y1 = sLat, x1 = sLon;
    const y2 = eLat, x2 = eLon;
    const A = x - x1; const B = y - y1;
    const C = x2 - x1; const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = (lenSq !== 0) ? dot / lenSq : -1;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return getHaversineDistance(y, x, yy, xx);
}

function getDistanceToPolyline(pLat, pLon, points) {
    let minDistance = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
        const s = points[i];
        const e = points[i+1];
        const dist = calculatePointToSegmentDistance(pLat, pLon, s[1], s[0], e[1], e[0]);
        if (dist < minDistance) minDistance = dist;
    }
    return minDistance;
}

export const findNearestRoutes = async (req, res, next) => {
    const { parentLat, parentLon, schoolId } = req.body;

    if (!parentLat || !parentLon || !schoolId) {
        return next(new AppError('Please provide parentLat, parentLon, and schoolId', 400));
    }

    try {
        const drivers = await pgPool.query(`
            SELECT d.id, d.route_polyline, v.vehicle_number, d.trip_start_latitude, d.trip_start_longitude
            FROM public.driver d
            JOIN public.driver_schools ds ON d.id = ds.driver_id
            JOIN public.vehicles v ON d.id = v.driver_id
            WHERE ds.school_id = $1 AND d.is_active = true
        `, [schoolId]);

        if (drivers.rows.length === 0) {
            return res.status(200).json([]);
        }

        const scoredDrivers = drivers.rows.map(driver => {
            if (!driver.route_polyline) {
                return { ...driver, distance_from_home: 999999, method: 'No Route Data' };
            }

            const roadDistance = getDistanceToPolyline(parentLat, parentLon, driver.route_polyline);
            return { 
                id: driver.id, 
                vehicle_number: driver.vehicle_number, 
                distance_from_home: roadDistance, 
                method: "Cached-Polyline" 
            };
        });

        const topMatches = scoredDrivers
            .sort((a, b) => a.distance_from_home - b.distance_from_home)
            .slice(0, 5);

        res.status(200).json(topMatches);
    } catch (err) {
        next(new AppError(err.message, 500));
    }
};

export const assignDriverToChild = async (req, res, next) => {
    const { childId, driverId } = req.body;

    if (!childId || !driverId) {
        return next(new AppError('childId and driverId are required', 400));
    }

    try {
        const result = await pgPool.query(
            `UPDATE public.children SET assigned_driver_id = $1 WHERE id = $2 RETURNING *`,
            [driverId, childId]
        );

        if (result.rowCount === 0) {
            return next(new AppError('No child found with that ID', 404));
        }

        res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
        next(new AppError('Database error during assignment', 500));
    }
};