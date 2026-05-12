// src/config/supabase.js
// One Supabase client for the whole backend. Never paste keys in code.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
}

// Service-role client — used only on the backend (never sent to browser)
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
