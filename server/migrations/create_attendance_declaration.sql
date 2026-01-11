-- Attendance Declaration Table
-- Run this SQL in your PostgreSQL database to create the required table

CREATE TABLE IF NOT EXISTS public.attendance_declaration (
  id SERIAL PRIMARY KEY,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  morning_present BOOLEAN DEFAULT true,
  evening_present BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(child_id, date)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_attendance_declaration_child_date 
ON public.attendance_declaration(child_id, date);

-- Grant permissions if needed (uncomment if required)
-- GRANT ALL ON public.attendance_declaration TO your_db_user;
-- GRANT USAGE, SELECT ON SEQUENCE attendance_declaration_id_seq TO your_db_user;
