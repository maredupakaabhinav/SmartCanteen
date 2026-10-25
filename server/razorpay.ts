import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.js';

const API = 'https://api.razorpay.com/v1';

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: 'created' | 'attempted' | 'paid';
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  error_description?: string | null;
}

function safeEqualHex(expectedHex: string, receivedHex: string): boolean {
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(receivedHex, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(
  params: { orderId: string; paymentId: string; signature: string },
  keySecret: string,
): boolean {
  const expected = createHmac('sha256', keySecret).update(`${params.orderId}|${params.paymentId}`).digest('hex');
  return safeEqualHex(expected, params.signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook secret). */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

async function call<T>(creds: RazorpayCredentials, path: string, init: RequestInit = {}): Promise<T> {
  const auth = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, 'The payment provider could not be reached. Please try again.');
  }
  if (!response.ok) {
    // Do not forward provider error bodies to the client.
    console.error(`[razorpay] ${init.method ?? 'GET'} ${path.split('/').slice(0, 2).join('/')} failed with ${response.status}`);
    throw new HttpError(502, 'The payment provider rejected the request. Please try again.');
  }
  return (await response.json()) as T;
}

export function createRazorpayOrder(
  creds: RazorpayCredentials,
  input: { amountPaise: number; receipt: string; notes: Record<string, string> },
) {
  return call<RazorpayOrder>(creds, '/orders', {
    method: 'POST',
    body: JSON.stringify({ amount: input.amountPaise, currency: 'INR', receipt: input.receipt, notes: input.notes }),
  });
}

export function fetchPayment(creds: RazorpayCredentials, paymentId: string) {
  return call<RazorpayPayment>(creds, `/payments/${encodeURIComponent(paymentId)}`);
}

export async function fetchOrderPayments(creds: RazorpayCredentials, orderId: string) {
  const res = await call<{ items: RazorpayPayment[] }>(creds, `/orders/${encodeURIComponent(orderId)}/payments`);
  return res.items;
}

export function capturePayment(creds: RazorpayCredentials, paymentId: string, amountPaise: number) {
  return call<RazorpayPayment>(creds, `/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: 'POST',
    body: JSON.stringify({ amount: amountPaise, currency: 'INR' }),
  });
}
