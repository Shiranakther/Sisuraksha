-- =============================================
-- ROUTE MANAGEMENT TABLES
-- parent_attendance_schedule, bus_trips, trip_children
-- =============================================

-- 1. Parent Attendance Schedule
-- Parents set daily/weekly pickup schedules per child
CREATE TABLE IF NOT EXISTS public.parent_attendance_schedule (
    id SERIAL PRIMARY KEY,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    parent_id BIGINT NOT NULL REFERENCES public.parent(id) ON DELETE CASCADE,
    schedule_date DATE NOT NULL,
    is_present BOOLEAN NOT NULL DEFAULT true,
    schedule_type VARCHAR(20) NOT NULL DEFAULT 'BOTH' CHECK (schedule_type IN ('MORNING', 'EVENING', 'BOTH')),
    pickup_lat DOUBLE PRECISION,
    pickup_lon DOUBLE PRECISION,
    pickup_address TEXT,
    dropoff_lat DOUBLE PRECISION,
    dropoff_lon DOUBLE PRECISION,
    dropoff_address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(child_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_pas_child_date ON public.parent_attendance_schedule(child_id, schedule_date);
CREATE INDEX IF NOT EXISTS idx_pas_parent ON public.parent_attendance_schedule(parent_id);

-- 2. Bus Trips
-- A trip created by the driver for a given day/type
CREATE TABLE IF NOT EXISTS public.bus_trips (
    id SERIAL PRIMARY KEY,
    driver_id BIGINT NOT NULL REFERENCES public.driver(id) ON DELETE CASCADE,
    trip_date DATE NOT NULL,
    trip_type VARCHAR(10) NOT NULL DEFAULT 'morning' CHECK (trip_type IN ('morning', 'evening')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    driver_start_latitude DOUBLE PRECISION,
    driver_start_longitude DOUBLE PRECISION,
    driver_end_latitude DOUBLE PRECISION,
    driver_end_longitude DOUBLE PRECISION,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bt_driver_date ON public.bus_trips(driver_id, trip_date);

-- 3. Trip Children
-- Each child assigned to a trip with stop order and boarding status
CREATE TABLE IF NOT EXISTS public.trip_children (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER NOT NULL REFERENCES public.bus_trips(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
    attendance_status VARCHAR(10) NOT NULL DEFAULT 'present',
    stop_order INTEGER NOT NULL DEFAULT 0,
    pickup_latitude DOUBLE PRECISION,
    pickup_longitude DOUBLE PRECISION,
    dropoff_latitude DOUBLE PRECISION,
    dropoff_longitude DOUBLE PRECISION,
    is_boarded BOOLEAN DEFAULT false,
    boarded_at TIMESTAMPTZ,
    boarding_method VARCHAR(20) DEFAULT 'manual',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tc_trip ON public.trip_children(trip_id);
CREATE INDEX IF NOT EXISTS idx_tc_child ON public.trip_children(child_id);

-- 4. Sri Lankan Public Holidays table
CREATE TABLE IF NOT EXISTS public.holidays (
    id SERIAL PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    holiday_name VARCHAR(255) NOT NULL,
    holiday_type VARCHAR(50) DEFAULT 'public',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert Sri Lankan holidays for 2025-2026
INSERT INTO public.holidays (holiday_date, holiday_name, holiday_type) VALUES
    ('2025-01-14', 'Thai Pongal Day', 'public'),
    ('2025-01-15', 'Duruthu Full Moon Poya Day', 'public'),
    ('2025-02-04', 'National Day', 'public'),
    ('2025-02-12', 'Navam Full Moon Poya Day', 'public'),
    ('2025-03-14', 'Medin Full Moon Poya Day', 'public'),
    ('2025-03-30', 'Eid ul-Fitr (Ramazan Festival)', 'public'),
    ('2025-04-12', 'Bak Full Moon Poya Day', 'public'),
    ('2025-04-13', 'Sinhala & Tamil New Year Eve', 'public'),
    ('2025-04-14', 'Sinhala & Tamil New Year', 'public'),
    ('2025-04-18', 'Good Friday', 'public'),
    ('2025-05-01', 'May Day', 'public'),
    ('2025-05-12', 'Vesak Full Moon Poya Day', 'public'),
    ('2025-05-13', 'Day After Vesak', 'public'),
    ('2025-06-07', 'Eid ul-Adha (Hadji Festival)', 'public'),
    ('2025-06-10', 'Poson Full Moon Poya Day', 'public'),
    ('2025-07-10', 'Esala Full Moon Poya Day', 'public'),
    ('2025-08-08', 'Nikini Full Moon Poya Day', 'public'),
    ('2025-09-05', 'Milad-un-Nabi (Prophet''s Birthday)', 'public'),
    ('2025-09-07', 'Binara Full Moon Poya Day', 'public'),
    ('2025-10-06', 'Vap Full Moon Poya Day', 'public'),
    ('2025-10-20', 'Deepavali', 'public'),
    ('2025-11-05', 'Il Full Moon Poya Day', 'public'),
    ('2025-12-04', 'Unduvap Full Moon Poya Day', 'public'),
    ('2025-12-25', 'Christmas Day', 'public'),
    ('2026-01-14', 'Thai Pongal Day', 'public'),
    ('2026-01-15', 'Duruthu Full Moon Poya Day', 'public'),
    ('2026-02-04', 'National Day', 'public'),
    ('2026-04-13', 'Sinhala & Tamil New Year Eve', 'public'),
    ('2026-04-14', 'Sinhala & Tamil New Year', 'public'),
    ('2026-05-01', 'May Day', 'public'),
    ('2026-05-12', 'Vesak Full Moon Poya Day', 'public'),
    ('2026-12-25', 'Christmas Day', 'public')
ON CONFLICT (holiday_date) DO NOTHING;
