import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Only create the client if credentials are configured
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Log warning if Supabase is not configured
if (!supabase) {
  console.warn('⚠️  Supabase not configured - tracking will use MongoDB fallback');
}
