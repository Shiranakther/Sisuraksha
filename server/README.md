# Server Setup (Supabase)

## Required environment variables
- POSTGRES_URI: Supabase connection string (Project Settings → Database → Connection string → Node.js).
- JWT_ACCESS_SECRET and JWT_REFRESH_SECRET: Tokens used by auth middleware.
- REFRESH_TOKEN_TTL: Interval string (for example `30 days`).

## Attendance table (minimum columns)
Create a table named `attendance` with:
- id: uuid (default `gen_random_uuid()`)
- mother_id: uuid (or text) — referenced user id
- child_name: text
- date: date
- came_to_school: boolean default false
- came_back_home: boolean default false
- school_arrival_location: jsonb (nullable)
- home_arrival_location: jsonb (nullable)
- created_at / updated_at: timestamp with time zone default now()

Add a unique constraint on `(mother_id, child_name, date)` so the upsert in the controller works.
