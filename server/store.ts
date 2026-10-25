import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';
import { serverEnv } from './env.js';

export interface OrderSummary {
  id: string;
  user_id: string | null;
  order_number: string;
  customer_name: string;
  total_paise: number;
  order_status: string;
  payment_status: string;
  pickup_number: number | null;
}

export interface PaymentAttempt {
  id: string;
  order_id: string;
  provider: 'razorpay' | 'demo';
  provider_order_id: string | null;
  provider_payment_id: string | null;
  amount_paise: number;
  status: 'created' | 'paid' | 'failed' | 'simulated';
}

export interface AuthUser {
  id: string;
  email: string | null;
}

/** Everything the payment handlers need from the database (service role). */
export interface Store {
  getUser(accessToken: string): Promise<AuthUser | null>;
  getOrder(orderId: string): Promise<OrderSummary | null>;
  listAttempts(orderId: string): Promise<PaymentAttempt[]>;
  findAttempt(providerOrderId: string): Promise<PaymentAttempt | null>;
  registerAttempt(orderId: string, providerOrderId: string, amountPaise: number): Promise<void>;
  confirmPayment(orderId: string, providerOrderId: string, providerPaymentId: string, amountPaise: number): Promise<OrderSummary>;
  recordFailure(providerOrderId: string, providerPaymentId: string | null, reason: string): Promise<void>;
  simulatePayment(orderId: string): Promise<OrderSummary>;
}

const ORDER_COLUMNS = 'id, user_id, order_number, customer_name, total_paise, order_status, payment_status, pickup_number';

function fail(context: string, error: { message: string; code?: string }): never {
  // Business-rule errors raised by our SQL functions (P0001/P0002/22023) are safe to show.
  if (error.code === 'P0001' || error.code === 'P0002' || error.code === '22023') {
    throw new HttpError(409, error.message);
  }
  console.error(`[store] ${context} failed (${error.code ?? 'no code'})`);
  throw new HttpError(500, 'We could not update your order. Please try again.');
}

export function createSupabaseStore(): Store {
  const env = serverEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new HttpError(503, 'The server is not configured yet (missing Supabase credentials).');
  }
  const admin: SupabaseClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    async getUser(accessToken) {
      const { data, error } = await admin.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },

    async getOrder(orderId) {
      const { data, error } = await admin.from('orders').select(ORDER_COLUMNS).eq('id', orderId).maybeSingle();
      if (error) fail('getOrder', error);
      return (data as OrderSummary | null) ?? null;
    },

    async listAttempts(orderId) {
      const { data, error } = await admin
        .from('payments')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (error) fail('listAttempts', error);
      return (data ?? []) as PaymentAttempt[];
    },

    async findAttempt(providerOrderId) {
      const { data, error } = await admin.from('payments').select('*').eq('provider_order_id', providerOrderId).maybeSingle();
      if (error) fail('findAttempt', error);
      return (data as PaymentAttempt | null) ?? null;
    },

    async registerAttempt(orderId, providerOrderId, amountPaise) {
      const { error } = await admin.rpc('register_payment_attempt', {
        p_order_id: orderId,
        p_provider: 'razorpay',
        p_provider_order_id: providerOrderId,
        p_amount_paise: amountPaise,
      });
      if (error) fail('registerAttempt', error);
    },

    async confirmPayment(orderId, providerOrderId, providerPaymentId, amountPaise) {
      const { data, error } = await admin
        .rpc('confirm_payment', {
          p_order_id: orderId,
          p_provider_order_id: providerOrderId,
          p_provider_payment_id: providerPaymentId,
          p_amount_paise: amountPaise,
        })
        .select(ORDER_COLUMNS)
        .single();
      if (error) fail('confirmPayment', error);
      return data as OrderSummary;
    },

    async recordFailure(providerOrderId, providerPaymentId, reason) {
      const { error } = await admin.rpc('record_payment_failure', {
        p_provider_order_id: providerOrderId,
        p_provider_payment_id: providerPaymentId,
        p_reason: reason,
      });
      if (error) fail('recordFailure', error);
    },

    async simulatePayment(orderId) {
      const { data, error } = await admin.rpc('simulate_payment', { p_order_id: orderId }).select(ORDER_COLUMNS).single();
      if (error) fail('simulatePayment', error);
      return data as OrderSummary;
    },
  };
}
