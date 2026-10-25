/**
 * Remembers the in-progress checkout for this browser tab so that double
 * clicks, retries after closing the payment window, and page refreshes reuse
 * the same order instead of creating duplicates. The database enforces the
 * same guarantee with a unique (user, idempotency_key) constraint.
 */
import type { CartLine } from '@/features/cart/cart-store';

const KEY = 'smart-canteen:checkout:v1';

interface CheckoutSession {
  signature: string;
  idempotencyKey: string;
  orderId: string | null;
}

export function cartSignature(lines: Pick<CartLine, 'itemId' | 'quantity'>[]): string {
  return lines
    .map((l) => `${l.itemId}:${l.quantity}`)
    .sort()
    .join('|');
}

function read(): CheckoutSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CheckoutSession) : null;
  } catch {
    return null;
  }
}

function write(session: CheckoutSession | null) {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    // ignore storage failures; the in-memory flow still works
  }
}

/** Returns the idempotency key for this cart and any previous unpaid order for a different cart. */
export function beginCheckout(signature: string): { idempotencyKey: string; staleOrderId: string | null } {
  const current = read();
  if (current && current.signature === signature) {
    return { idempotencyKey: current.idempotencyKey, staleOrderId: null };
  }
  const idempotencyKey = crypto.randomUUID();
  write({ signature, idempotencyKey, orderId: null });
  return { idempotencyKey, staleOrderId: current?.orderId ?? null };
}

export function rememberOrder(orderId: string) {
  const current = read();
  if (current) write({ ...current, orderId });
}

export function currentCheckoutOrderId(): string | null {
  return read()?.orderId ?? null;
}

export function endCheckout() {
  write(null);
}
