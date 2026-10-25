/**
 * Server-only configuration. Never import this file from `src/` — it reads
 * secrets that must not be bundled into the browser.
 */
export type PaymentMode = 'razorpay' | 'demo' | 'disabled';

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function serverEnv() {
  return {
    supabaseUrl: read('SUPABASE_URL') ?? read('VITE_SUPABASE_URL'),
    supabaseServiceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),
    razorpayKeyId: read('RAZORPAY_KEY_ID'),
    razorpayKeySecret: read('RAZORPAY_KEY_SECRET'),
    razorpayWebhookSecret: read('RAZORPAY_WEBHOOK_SECRET'),
    paymentModeOverride: read('PAYMENT_MODE'),
  };
}

/**
 * Razorpay is used whenever its keys are configured. Demo mode must be enabled
 * explicitly with PAYMENT_MODE=demo and is ignored if Razorpay keys exist, so a
 * production deployment can never silently fall back to simulated payments.
 */
export function paymentMode(env = serverEnv()): PaymentMode {
  if (env.razorpayKeyId && env.razorpayKeySecret) return 'razorpay';
  if (env.paymentModeOverride === 'demo') return 'demo';
  return 'disabled';
}
