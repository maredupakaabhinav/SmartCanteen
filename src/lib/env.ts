/** Public (browser-safe) configuration. Never put secrets in VITE_ variables. */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim() ?? '';

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  isSupabaseConfigured: Boolean(url && anonKey),
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL?.trim() || null,
} as const;
