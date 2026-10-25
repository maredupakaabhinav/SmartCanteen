import { CreditCard, FlaskConical, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Notice } from '@/components/common';
import { Skeleton } from '@/components/ui/skeleton';
import type { PaymentMode } from './payment';

/** Explains exactly how the student will pay — including a clearly labelled demo mode. */
export function PaymentMethod({ mode, loading }: { mode: PaymentMode | undefined; loading: boolean }) {
  if (loading) return <Skeleton className="h-20 w-full rounded-md" />;

  if (mode === 'razorpay') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-brand/25 bg-brand-softer px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-brand shadow-xs">
          <CreditCard className="size-5" aria-hidden />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-ink">Pay online with Razorpay</p>
          <p className="mt-0.5 text-ink-muted">UPI, debit/credit cards, netbanking and wallets.</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <ShieldCheck className="size-3.5 text-brand" aria-hidden /> Your order is confirmed only after the payment is verified.
          </p>
        </div>
      </div>
    );
  }

  if (mode === 'demo') {
    return (
      <Notice tone="info" icon={<FlaskConical />} title="Demo payment mode — no real money is charged">
        This deployment is running without a payment provider. Your order will be marked as a{' '}
        <strong>simulated payment</strong>, labelled “Demo payment” everywhere, and excluded from revenue.
      </Notice>
    );
  }

  return (
    <Notice tone="danger" icon={<TriangleAlert />} title="Online payments aren’t available right now">
      The canteen hasn’t finished setting up payments. Please try again later or order at the counter.
    </Notice>
  );
}
