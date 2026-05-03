-- Accident Alerts table
-- Stores ESP32 accident detection events with full lifecycle tracking
CREATE TABLE IF NOT EXISTS public.accident_alerts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  driver_id     UUID REFERENCES public.driver(id),
  bus_id        VARCHAR(50),          -- raw identifier from ESP32 (maps to vehicles.vehicle_number)
  alert_type    VARCHAR(50) NOT NULL, -- FRONTAL CRASH, SIDE IMPACT, ROLLOVER, FIRE, SUBMERSION
  status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING / CONFIRMED / CANCELLED
  confidence    REAL,
  evidence      TEXT,
  sensor_data   JSONB,                -- full sensor snapshot from ESP32
  location_lat  DOUBLE PRECISION,     -- driver's last known latitude
  location_lon  DOUBLE PRECISION,     -- driver's last known longitude
  notified_at   TIMESTAMPTZ,          -- when notifications were sent
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ           -- when cancelled or confirmed
);

CREATE INDEX idx_accident_alerts_driver ON public.accident_alerts(driver_id);
CREATE INDEX idx_accident_alerts_status ON public.accident_alerts(status);
CREATE INDEX idx_accident_alerts_created ON public.accident_alerts(created_at DESC);
