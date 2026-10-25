import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentHandlers, type PaymentDeps, type RazorpayApi } from '../../server/payments';
import { verifyCheckoutSignature, verifyWebhookSignature, type RazorpayPayment } from '../../server/razorpay';
import type { OrderSummary, PaymentAttempt, Store } from '../../server/store';
import { paymentMode } from '../../server/env';

const SECRET = 'test_key_secret';
const WEBHOOK_SECRET = 'test_webhook_secret';
const ORDER_ID = '7d3c1f9e-8a51-4c33-9a43-0d2a7e2b5c11';
const OTHER_ORDER_ID = '0b8f3a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('hex');

function fakeStore() {
  const orders = new Map<string, OrderSummary>([
    [ORDER_ID, { id: ORDER_ID, user_id: 'alice', order_number: 'SC-261014-0001', customer_name: 'Alice', total_paise: 7500, order_status: 'awaiting_payment', payment_status: 'pending', pickup_number: null }],
    [OTHER_ORDER_ID, { id: OTHER_ORDER_ID, user_id: 'bob', order_number: 'SC-261014-0002', customer_name: 'Bob', total_paise: 3000, order_status: 'awaiting_payment', payment_status: 'pending', pickup_number: null }],
  ]);
  const attempts: PaymentAttempt[] = [];
  const store: Store & { orders: typeof orders; attempts: typeof attempts; confirmations: number } = {
    orders,
    attempts,
    confirmations: 0,
    async getUser(token) {
      return token === 'alice-token' ? { id: 'alice', email: 'alice@example.edu' } : token === 'bob-token' ? { id: 'bob', email: null } : null;
    },
    async getOrder(id) {
      return orders.get(id) ?? null;
    },
    async listAttempts(orderId) {
      return attempts.filter((a) => a.order_id === orderId);
    },
    async findAttempt(providerOrderId) {
      return attempts.find((a) => a.provider_order_id === providerOrderId) ?? null;
    },
    async registerAttempt(orderId, providerOrderId, amount) {
      attempts.push({ id: String(attempts.length + 1), order_id: orderId, provider: 'razorpay', provider_order_id: providerOrderId, provider_payment_id: null, amount_paise: amount, status: 'created' });
    },
    async confirmPayment(orderId, providerOrderId, paymentId, amount) {
      store.confirmations += 1;
      const order = orders.get(orderId)!;
      if (amount !== order.total_paise) throw new Error('amount mismatch');
      const attempt = attempts.find((a) => a.provider_order_id === providerOrderId)!;
      attempt.status = 'paid';
      attempt.provider_payment_id = paymentId;
      const updated = { ...order, payment_status: 'paid', order_status: 'placed', pickup_number: order.pickup_number ?? 7 };
      orders.set(orderId, updated);
      return updated;
    },
    async recordFailure(providerOrderId) {
      const attempt = attempts.find((a) => a.provider_order_id === providerOrderId);
      if (attempt && attempt.status !== 'paid') attempt.status = 'failed';
    },
    async simulatePayment(orderId) {
      const updated = { ...orders.get(orderId)!, payment_status: 'simulated', order_status: 'placed', pickup_number: 3 };
      orders.set(orderId, updated);
      return updated;
    },
  };
  return store;
}

function fakeRazorpay(payment: Partial<RazorpayPayment> = {}) {
  const api: RazorpayApi & { created: number } = {
    created: 0,
    createOrder: vi.fn(async (_c, input) => {
      api.created += 1;
      return { id: `order_rzp${api.created}`, amount: input.amountPaise, currency: 'INR', status: 'created' as const };
    }),
    fetchPayment: vi.fn(async (_c, id) => ({ id, order_id: 'order_rzp1', amount: 7500, currency: 'INR', status: 'captured' as const, ...payment })),
    fetchOrderPayments: vi.fn(async () => [{ id: 'pay_1', order_id: 'order_rzp1', amount: 7500, currency: 'INR', status: 'captured' as const, ...payment }]),
    capturePayment: vi.fn(async (_c, id, amount) => ({ id, order_id: 'order_rzp1', amount, currency: 'INR', status: 'captured' as const })),
  };
  return api;
}

function post(path: string, body: unknown, token?: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

let store: ReturnType<typeof fakeStore>;
let razorpay: ReturnType<typeof fakeRazorpay>;
let deps: PaymentDeps;
let api: ReturnType<typeof createPaymentHandlers>;

beforeEach(() => {
  store = fakeStore();
  razorpay = fakeRazorpay();
  deps = { store, mode: 'razorpay', razorpay, credentials: { keyId: 'rzp_test_x', keySecret: SECRET }, webhookSecret: WEBHOOK_SECRET };
  api = createPaymentHandlers(() => deps);
});

describe('signature helpers', () => {
  it('verifies Razorpay checkout signatures', () => {
    const signature = sign('order_1|pay_1', SECRET);
    expect(verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature }, SECRET)).toBe(true);
    expect(verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_2', signature }, SECRET)).toBe(false);
    expect(verifyCheckoutSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: 'abc' }, SECRET)).toBe(false);
  });

  it('verifies webhook signatures over the raw body', () => {
    const body = '{"event":"payment.captured"}';
    expect(verifyWebhookSignature(body, sign(body, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(true);
    expect(verifyWebhookSignature(body + ' ', sign(body, WEBHOOK_SECRET), WEBHOOK_SECRET)).toBe(false);
  });
});

describe('payment mode', () => {
  it('never falls back to demo when Razorpay keys exist', () => {
    const base = { supabaseUrl: 'x', supabaseServiceRoleKey: 'x', razorpayWebhookSecret: undefined };
    expect(paymentMode({ ...base, razorpayKeyId: 'k', razorpayKeySecret: 's', paymentModeOverride: 'demo' })).toBe('razorpay');
    expect(paymentMode({ ...base, razorpayKeyId: undefined, razorpayKeySecret: undefined, paymentModeOverride: 'demo' })).toBe('demo');
    expect(paymentMode({ ...base, razorpayKeyId: undefined, razorpayKeySecret: undefined, paymentModeOverride: undefined })).toBe('disabled');
  });
});

describe('POST /api/payments/create', () => {
  it('requires a signed-in user', async () => {
    const res = await api.create(post('/api/payments/create', { orderId: ORDER_ID }));
    expect(res.status).toBe(401);
  });

  it("refuses to start payment for another student's order", async () => {
    const res = await api.create(post('/api/payments/create', { orderId: OTHER_ORDER_ID }, 'alice-token'));
    expect(res.status).toBe(404);
  });

  it('creates one Razorpay order for the database total and reuses it on retry', async () => {
    const first = await (await api.create(post('/api/payments/create', { orderId: ORDER_ID }, 'alice-token'))).json();
    expect(first).toMatchObject({ mode: 'razorpay', providerOrderId: 'order_rzp1', amountPaise: 7500, keyId: 'rzp_test_x' });
    const second = await (await api.create(post('/api/payments/create', { orderId: ORDER_ID }, 'alice-token'))).json();
    expect(second.providerOrderId).toBe('order_rzp1');
    expect(razorpay.created).toBe(1);
  });

  it('rejects malformed input', async () => {
    const res = await api.create(post('/api/payments/create', { orderId: 'not-a-uuid' }, 'alice-token'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/verify', () => {
  async function startPayment() {
    await api.create(post('/api/payments/create', { orderId: ORDER_ID }, 'alice-token'));
  }

  it('confirms a correctly signed, captured payment', async () => {
    await startPayment();
    const res = await api.verify(
      post('/api/payments/verify', { orderId: ORDER_ID, razorpay_order_id: 'order_rzp1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_rzp1|pay_1', SECRET) }, 'alice-token'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ paymentStatus: 'paid', orderStatus: 'placed', pickupNumber: 7 });
  });

  it('rejects a forged signature without touching the order', async () => {
    await startPayment();
    const res = await api.verify(
      post('/api/payments/verify', { orderId: ORDER_ID, razorpay_order_id: 'order_rzp1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_rzp1|pay_1', 'wrong') }, 'alice-token'),
    );
    expect(res.status).toBe(400);
    expect(store.confirmations).toBe(0);
    expect(store.orders.get(ORDER_ID)!.payment_status).toBe('pending');
  });

  it('rejects a payment whose amount differs from the order total', async () => {
    razorpay = fakeRazorpay({ amount: 100 });
    deps.razorpay = razorpay;
    await startPayment();
    const res = await api.verify(
      post('/api/payments/verify', { orderId: ORDER_ID, razorpay_order_id: 'order_rzp1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_rzp1|pay_1', SECRET) }, 'alice-token'),
    );
    expect(res.status).toBe(400);
    expect(store.confirmations).toBe(0);
  });

  it('does not confirm failed payments', async () => {
    razorpay = fakeRazorpay({ status: 'failed' });
    deps.razorpay = razorpay;
    await startPayment();
    const res = await api.verify(
      post('/api/payments/verify', { orderId: ORDER_ID, razorpay_order_id: 'order_rzp1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_rzp1|pay_1', SECRET) }, 'alice-token'),
    );
    expect(res.status).toBe(402);
    expect(store.attempts[0]!.status).toBe('failed');
  });

  it('captures an authorised payment before confirming', async () => {
    razorpay = fakeRazorpay({ status: 'authorized' });
    deps.razorpay = razorpay;
    await startPayment();
    const res = await api.verify(
      post('/api/payments/verify', { orderId: ORDER_ID, razorpay_order_id: 'order_rzp1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_rzp1|pay_1', SECRET) }, 'alice-token'),
    );
    expect(res.status).toBe(200);
    expect(razorpay.capturePayment).toHaveBeenCalledOnce();
  });

  it("cannot be used to pay someone else's order", async () => {
    await startPayment();
    const res = await api.verify(
      post('/api/payments/verify', { orderId: ORDER_ID, razorpay_order_id: 'order_rzp1', razorpay_payment_id: 'pay_1', razorpay_signature: sign('order_rzp1|pay_1', SECRET) }, 'bob-token'),
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/simulate', () => {
  it('is refused unless demo mode is enabled on the server', async () => {
    const res = await api.simulate(post('/api/payments/simulate', { orderId: ORDER_ID }, 'alice-token'));
    expect(res.status).toBe(403);
    expect(store.orders.get(ORDER_ID)!.payment_status).toBe('pending');
  });

  it('marks the order as simulated (not paid) in demo mode', async () => {
    deps.mode = 'demo';
    const res = await api.simulate(post('/api/payments/simulate', { orderId: ORDER_ID }, 'alice-token'));
    expect((await res.json()).order.paymentStatus).toBe('simulated');
  });
});

describe('POST /api/payments/webhook', () => {
  it('rejects unsigned or tampered events', async () => {
    const body = JSON.stringify({ event: 'payment.captured' });
    expect((await api.webhook(post('/api/payments/webhook', body))).status).toBe(401);
    expect((await api.webhook(post('/api/payments/webhook', body, undefined, { 'x-razorpay-signature': sign(body, 'nope') }))).status).toBe(401);
  });

  it('confirms the order on payment.captured and is idempotent', async () => {
    await api.create(post('/api/payments/create', { orderId: ORDER_ID }, 'alice-token'));
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_9', order_id: 'order_rzp1', amount: 7500, currency: 'INR', status: 'captured' } } },
    });
    const headers = { 'x-razorpay-signature': sign(body, WEBHOOK_SECRET) };
    expect((await api.webhook(post('/api/payments/webhook', body, undefined, headers))).status).toBe(200);
    expect(store.orders.get(ORDER_ID)!.payment_status).toBe('paid');
    expect((await api.webhook(post('/api/payments/webhook', body, undefined, headers))).status).toBe(200);
    expect(store.confirmations).toBe(1);
  });
});
