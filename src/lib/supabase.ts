import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from './env';

/**
 * Browser Supabase client (anon key + the signed-in user's session).
 * All access control is enforced by Row Level Security in the database.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'missing-anon-key',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  },
);
