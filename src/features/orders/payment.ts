/**
 * Client side of the payment flow. The browser only opens Razorpay Checkout
 * and forwards its response to /api/payments/verify; the server decides
 * whether the order is paid.
 */
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';

export type PaymentMode = 'razorpay' | 'demo' | 'disabled';

interface PublicOrder {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  pickupNumber: number | null;
}

type CreateResponse =
  | { mode: 'demo'; order: PublicOrder }
  | {
      mode: 'razorpay';
      keyId: string;
      providerOrderId: string;
      amountPaise: number;
      currency: 'INR';
      order: PublicOrder;
      prefill: { name?: string; email?: string };
    };

export function usePaymentConfig() {
  return useQuery({
    queryKey: ['payments', 'config'],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: () => apiRequest<{ mode: PaymentMode; keyId: string | null }>('/api/payments/config', { method: 'GET' }),
  });
}

/* ------------------------------------------------------------------ Razorpay */
interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type PaymentOutcome =
  | { status: 'paid'; order: PublicOrder }
  | { status: 'dismissed' }
  | { status: 'failed'; message: string };

/** Start payment for an existing unpaid order. Resolves when the student finishes or closes checkout. */
export async function payForOrder(orderId: string, opts: { onVerifying?: () => void } = {}): Promise<PaymentOutcome> {
  const session = await apiRequest<CreateResponse>('/api/payments/create', { body: { orderId } });

  if (session.mode === 'demo') {
    const res = await apiRequest<{ order: PublicOrder }>('/api/payments/simulate', { body: { orderId } });
    return { status: 'paid', order: res.order };
  }

  await loadRazorpay();
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Could not load the payment window.');

  return new Promise<PaymentOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: PaymentOutcome) => {
      if (!settled) {
        settled = true;
        resolve(outcome);
      }
    };

    const checkout = new Razorpay({
      key: session.keyId,
      order_id: session.providerOrderId,
      amount: session.amountPaise,
      currency: session.currency,
      name: 'Smart Canteen',
      description: `Order ${session.order.orderNumber}`,
      prefill: session.prefill,
      theme: { color: '#236B45' },
      timeout: 900,
      retry: { enabled: true },
      handler: async (response: RazorpaySuccess) => {
        opts.onVerifying?.();
        try {
          const res = await apiRequest<{ order: PublicOrder }>('/api/payments/verify', {
            body: { orderId, ...response },
          });
          finish({ status: 'paid', order: res.order });
        } catch (error) {
          finish({ status: 'failed', message: error instanceof Error ? error.message : 'We could not verify your payment.' });
        }
      },
      modal: {
        ondismiss: () => finish({ status: 'dismissed' }),
        confirm_close: true,
      },
    });
    checkout.on('payment.failed', (response) => {
      // Razorpay keeps the modal open so the student can retry; we only note the reason.
      void response;
    });
    checkout.open();
  });
}

/** Ask the server to check with Razorpay whether an unpaid order was actually paid. */
export function reconcilePayment(orderId: string) {
  return apiRequest<{ order: PublicOrder }>('/api/payments/reconcile', { body: { orderId } });
}
