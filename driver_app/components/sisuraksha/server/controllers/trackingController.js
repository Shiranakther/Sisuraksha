import mongoose from 'mongoose';
import { supabase } from '../config/supabaseClient.js';

export const postGpsPoint = async (req, res, next) => {
  try {
    // MVP protection (later replace with proper driver auth JWT)
    const ingestKey = req.header('x-ingest-key');
    if (ingestKey !== process.env.TRACKING_INGEST_KEY) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { busId, tripId = null, lat, lng, speedMps = 0, heading = null, ts } = req.body;

    if (!busId || typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'busId, lat, lng required' });
    }

    // IMPORTANT: store ts as Date in Mongo
    const time = ts ? new Date(ts) : new Date();

    // 1) Save history point in Mongo (gps_events)
    await mongoose.connection.db.collection('gps_events').insertOne({
      busId,
      tripId,
      ts: time,
      lat,
      lng,
      speedMps,
      heading,
    });

    // 2) Update last location in Supabase (one row per bus) if configured
    if (supabase) {
      const { error } = await supabase.from('bus_last_location').upsert({
        bus_id: busId,
        lat,
        lng,
        speed_mps: speedMps,
        heading,
        ts: time.toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) return res.status(500).json({ error: 'supabase_error', details: error.message });
    }

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
};

export const getBusLastLocation = async (req, res, next) => {
  try {
    const { busId } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from('bus_last_location')
        .select('*')
        .eq('bus_id', busId)
        .maybeSingle();

      if (error) return res.status(500).json({ error: 'db_error', details: error.message });
      if (!data) return res.status(404).json({ error: 'no_location' });

      return res.json(data);
    }

    // Fallback: derive last location from MongoDB gps_events when Supabase is not configured
    const last = await mongoose.connection.db
      .collection('gps_events')
      .find({ busId })
      .sort({ ts: -1 })
      .limit(1)
      .project({ _id: 0, lat: 1, lng: 1, ts: 1, speedMps: 1, heading: 1 })
      .toArray();

    if (!last.length) return res.status(404).json({ error: 'no_location' });

    const row = last[0];
    return res.json({
      bus_id: busId,
      lat: row.lat,
      lng: row.lng,
      speed_mps: row.speedMps ?? 0,
      heading: row.heading ?? null,
      ts: row.ts instanceof Date ? row.ts.toISOString() : new Date(row.ts).toISOString(),
      updated_at: row.ts instanceof Date ? row.ts.toISOString() : new Date(row.ts).toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

export const getBusPath = async (req, res, next) => {
  try {
    const { busId } = req.params;
    const minutes = Number(req.query.minutes ?? 30);
    const since = new Date(Date.now() - minutes * 60 * 1000);

    const points = await mongoose.connection.db
      .collection('gps_events')
      .find({ busId, ts: { $gte: since } })
      .sort({ ts: 1 })
      .project({ _id: 0, lat: 1, lng: 1, ts: 1, speedMps: 1 })
      .toArray();

    res.json({ busId, points });
  } catch (err) {
    next(err);
  }
};