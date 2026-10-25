/**
 * Payment API. The browser never decides whether an order is paid: it only
 * forwards Razorpay's checkout response, which is verified here (HMAC
 * signature + a direct lookup of the payment on Razorpay) before the
 * service-role-only `confirm_payment` database function is called.
 */
import { z } from 'zod';
import { HttpError, bearerToken, json, readJson, route } from './http.js';
import { paymentMode, serverEnv, type PaymentMode } from './env.js';
import {
  capturePayment,
  createRazorpayOrder,
  fetchOrderPayments,
  fetchPayment,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  type RazorpayCredentials,
  type RazorpayPayment,
} from './razorpay.js';
import { createSupabaseStore, type AuthUser, type OrderSummary, type Store } from './store.js';

export interface RazorpayApi {
  createOrder: typeof createRazorpayOrder;
  fetchPayment: typeof fetchPayment;
  fetchOrderPayments: typeof fetchOrderPayments;
  capturePayment: typeof capturePayment;
}

export interface PaymentDeps {
  store: Store;
  mode: PaymentMode;
  razorpay: RazorpayApi;
  credentials: RazorpayCredentials | null;
  webhookSecret: string | null;
}

export function defaultDeps(): PaymentDeps {
  const env = serverEnv();
  const mode = paymentMode(env);
  return {
    store: createSupabaseStore(),
    mode,
    razorpay: { createOrder: createRazorpayOrder, fetchPayment, fetchOrderPayments, capturePayment },
    credentials:
      mode === 'razorpay' && env.razorpayKeyId && env.razorpayKeySecret
        ? { keyId: env.razorpayKeyId, keySecret: env.razorpayKeySecret }
        : null,
    webhookSecret: env.razorpayWebhookSecret ?? null,
  };
}

const orderIdSchema = z.object({ orderId: z.uuid() });
const verifySchema = z.object({
  orderId: z.uuid(),
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, 'Invalid request.');
  return result.data;
}

async function requireUser(deps: PaymentDeps, request: Request): Promise<AuthUser> {
  const user = await deps.store.getUser(bearerToken(request));
  if (!user) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return user;
}

/** Load an order and make sure it belongs to the signed-in student. */
async function requireOwnOrder(deps: PaymentDeps, user: AuthUser, orderId: string): Promise<OrderSummary> {
  const order = await deps.store.getOrder(orderId);
  // Same response for "missing" and "not yours" so order IDs cannot be probed.
  if (!order || order.user_id !== user.id) throw new HttpError(404, 'Order not found.');
  return order;
}

function publicOrder(order: OrderSummary) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    orderStatus: order.order_status,
    paymentStatus: order.payment_status,
    pickupNumber: order.pickup_number,
  };
}

function requireCredentials(deps: PaymentDeps): RazorpayCredentials {
  if (deps.mode !== 'razorpay' || !deps.credentials) {
    throw new HttpError(503, 'Online payments are not configured.');
  }
  return deps.credentials;
}

/**
 * Confirm a Razorpay payment after checking it directly with Razorpay.
 * Captures authorised payments if the account does not auto-capture.
 */
async function settleRazorpayPayment(
  deps: PaymentDeps,
  order: OrderSummary,
  providerOrderId: string,
  payment: RazorpayPayment,
): Promise<OrderSummary | null> {
  const creds = requireCredentials(deps);
  if (payment.order_id !== providerOrderId) {
    throw new HttpError(400, 'This payment does not belong to this order.');
  }
  if (payment.currency !== 'INR' || payment.amount !== order.total_paise) {
    throw new HttpError(400, 'The payment amount does not match your order total.');
  }
  let settled = payment;
  if (settled.status === 'authorized') {
    settled = await deps.razorpay.capturePayment(creds, settled.id, order.total_paise);
  }
  if (settled.status !== 'captured') {
    if (settled.status === 'failed') {
      await deps.store.recordFailure(providerOrderId, settled.id, settled.error_description ?? 'Payment failed');
    }
    return null;
  }
  return deps.store.confirmPayment(order.id, providerOrderId, settled.id, settled.amount);
}

export function createPaymentHandlers(getDeps: () => PaymentDeps = defaultDeps) {
  /** GET /api/payments/config — tells the client which checkout to show. */
  const config = route('GET', async () => {
    const env = serverEnv();
    const mode = paymentMode(env);
    return json({ mode, keyId: mode === 'razorpay' ? env.razorpayKeyId : null });
  });

  /** POST /api/payments/create — start (or resume) payment for an unpaid order. */
  const create = route('POST', async (request) => {
    const deps = getDeps();
    const user = await requireUser(deps, request);
    const { orderId } = parse(orderIdSchema, await readJson(request));
    const order = await requireOwnOrder(deps, user, orderId);

    if (order.order_status !== 'awaiting_payment') {
      throw new HttpError(409, 'This order is no longer awaiting payment.');
    }
    if (deps.mode === 'demo') return json({ mode: 'demo', order: publicOrder(order) });

    const creds = requireCredentials(deps);
    // Reuse an open Razorpay order for the same amount so retries don't create duplicates.
    const attempts = await deps.store.listAttempts(order.id);
    let attempt = attempts.find(
      (a) => a.provider === 'razorpay' && a.status !== 'paid' && a.amount_paise === order.total_paise && a.provider_order_id,
    );
    if (!attempt) {
      const rzpOrder = await deps.razorpay.createOrder(creds, {
        amountPaise: order.total_paise,
        receipt: order.order_number,
        notes: { order_id: order.id, order_number: order.order_number },
      });
      await deps.store.registerAttempt(order.id, rzpOrder.id, order.total_paise);
      attempt = {
        id: '',
        order_id: order.id,
        provider: 'razorpay',
        provider_order_id: rzpOrder.id,
        provider_payment_id: null,
        amount_paise: order.total_paise,
        status: 'created',
      };
    }

    return json({
      mode: 'razorpay',
      keyId: creds.keyId,
      providerOrderId: attempt.provider_order_id,
      amountPaise: order.total_paise,
      currency: 'INR',
      order: publicOrder(order),
      prefill: { name: order.customer_name || undefined, email: user.email ?? undefined },
    });
  });

  /** POST /api/payments/verify — verify Razorpay checkout response and confirm. */
  const verify = route('POST', async (request) => {
    const deps = getDeps();
    const user = await requireUser(deps, request);
    const body = parse(verifySchema, await readJson(request));
    const creds = requireCredentials(deps);
    const order = await requireOwnOrder(deps, user, body.orderId);

    const attempt = await deps.store.findAttempt(body.razorpay_order_id);
    if (!attempt || attempt.order_id !== order.id) {
      throw new HttpError(400, 'This payment does not belong to this order.');
    }
    if (order.payment_status === 'paid') {
      return json({ order: publicOrder(order) });
    }

    const signatureOk = verifyCheckoutSignature(
      { orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature },
      creds.keySecret,
    );
    if (!signatureOk) throw new HttpError(400, 'We could not verify this payment. If money was deducted, it will be reconciled automatically.');

    const payment = await deps.razorpay.fetchPayment(creds, body.razorpay_payment_id);
    const confirmed = await settleRazorpayPayment(deps, order, body.razorpay_order_id, payment);
    if (!confirmed) throw new HttpError(402, 'The payment was not completed. You can try again.');
    return json({ order: publicOrder(confirmed) });
  });

  /**
   * POST /api/payments/reconcile — ask Razorpay directly whether an unpaid order
   * was actually paid (e.g. the browser closed before verification finished).
   */
  const reconcile = route('POST', async (request) => {
    const deps = getDeps();
    const user = await requireUser(deps, request);
    const { orderId } = parse(orderIdSchema, await readJson(request));
    let order = await requireOwnOrder(deps, user, orderId);
    if (order.order_status !== 'awaiting_payment' || deps.mode !== 'razorpay') {
      return json({ order: publicOrder(order) });
    }
    const creds = requireCredentials(deps);
    const attempts = await deps.store.listAttempts(order.id);
    for (const attempt of attempts) {
      if (attempt.provider !== 'razorpay' || !attempt.provider_order_id) continue;
      const payments = await deps.razorpay.fetchOrderPayments(creds, attempt.provider_order_id);
      const candidate =
        payments.find((p) => p.status === 'captured') ?? payments.find((p) => p.status === 'authorized');
      if (!candidate) continue;
      const confirmed = await settleRazorpayPayment(deps, order, attempt.provider_order_id, candidate);
      if (confirmed) {
        order = confirmed;
        break;
      }
    }
    return json({ order: publicOrder(order) });
  });

  /** POST /api/payments/simulate — DEMO MODE ONLY. Marks the order 'simulated', never 'paid'. */
  const simulate = route('POST', async (request) => {
    const deps = getDeps();
    if (deps.mode !== 'demo') throw new HttpError(403, 'Demo payments are disabled.');
    const user = await requireUser(deps, request);
    const { orderId } = parse(orderIdSchema, await readJson(request));
    const order = await requireOwnOrder(deps, user, orderId);
    if (order.payment_status === 'simulated') return json({ order: publicOrder(order) });
    const updated = await deps.store.simulatePayment(order.id);
    return json({ order: publicOrder(updated) });
  });

  /** POST /api/payments/webhook — Razorpay server-to-server events. */
  const webhook = route('POST', async (request) => {
    const deps = getDeps();
    if (!deps.webhookSecret) throw new HttpError(503, 'Webhook is not configured.');
    const raw = await request.text();
    const signature = request.headers.get('x-razorpay-signature') ?? '';
    if (!signature || !verifyWebhookSignature(raw, signature, deps.webhookSecret)) {
      throw new HttpError(401, 'Invalid signature.');
    }

    let event: { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } };
    try {
      event = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Invalid payload.');
    }
    const payment = event.payload?.payment?.entity;
    if (!payment?.order_id) return json({ ok: true, ignored: true });

    const attempt = await deps.store.findAttempt(payment.order_id);
    if (!attempt) return json({ ok: true, ignored: true });

    if (event.event === 'payment.failed') {
      await deps.store.recordFailure(payment.order_id, payment.id, payment.error_description ?? 'Payment failed');
      return json({ ok: true });
    }

    if (event.event === 'payment.captured' || event.event === 'order.paid' || event.event === 'payment.authorized') {
      const order = await deps.store.getOrder(attempt.order_id);
      if (!order) return json({ ok: true, ignored: true });
      if (order.payment_status === 'paid') return json({ ok: true });
      await settleRazorpayPayment(deps, order, payment.order_id, payment);
      return json({ ok: true });
    }

    return json({ ok: true, ignored: true });
  });

  return { config, create, verify, reconcile, simulate, webhook };
}
