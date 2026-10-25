import { Link, Navigate, useParams } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Check, FlaskConical, Printer, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, Notice } from '@/components/common';
import { Logo } from '@/components/brand/logo';
import { useOrder } from '@/features/orders/queries';
import { OrderItemsList, OrderStatusBadge, PaymentStatusBadge } from '@/features/orders/order-ui';
import { PriceBreakdown } from '@/features/cart/order-summary';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime, formatPickupNumber } from '@/lib/format';
import { useDocumentTitle } from '@/lib/use-document-title';

export default function OrderConfirmationPage() {
  const { orderId } = useParams();
  const { data: order, isPending, isError, error, refetch } = useOrder(orderId);
  const reduce = useReducedMotion();
  useDocumentTitle(order ? `Order ${order.order_number}` : 'Order confirmation');

  if (isPending) {
    return (
      <div className="page-container max-w-2xl py-12">
        <Skeleton className="mx-auto size-16 rounded-full" />
        <Skeleton className="mx-auto mt-6 h-8 w-64" />
        <Skeleton className="mt-10 h-48 w-full rounded-xl" />
        <Skeleton className="mt-6 h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;
  if (!order) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="Order not found"
        description="This order doesn’t exist or belongs to a different account."
        action={<Button asChild variant="outline"><Link to="/orders">Go to my orders</Link></Button>}
      />
    );
  }
  // Only verified (or clearly simulated) orders get a confirmation page.
  if (order.payment_status !== 'paid' && order.payment_status !== 'simulated') {
    return <Navigate to={`/orders/${order.id}`} replace />;
  }

  const simulated = order.payment_status === 'simulated';

  return (
    <div className="page-container max-w-2xl pt-8 pb-16 sm:pt-12">
      <div className="no-print text-center">
        <motion.div
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
          className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-white shadow-md"
        >
          <Check className="size-8" strokeWidth={2.5} aria-hidden />
        </motion.div>
        <h1 className="mt-6 text-[28px] leading-9 font-semibold tracking-[-0.02em]">
          {simulated ? 'Demo order placed' : 'Order confirmed'}
        </h1>
        <p className="mt-2 text-ink-muted" role="status">
          {simulated
            ? 'This order used a simulated payment — no money was charged.'
            : 'Payment verified. Your order has been sent to the kitchen.'}
        </p>
      </div>

      {simulated && (
        <Notice tone="info" icon={<FlaskConical />} className="no-print mt-6" title="Demo mode">
          The canteen sees this order labelled “Demo payment”. It is excluded from revenue reports.
        </Notice>
      )}

      {/* Pickup number — designed to be read from across the counter */}
      <section aria-labelledby="pickup-label" className="print-plain mt-8 overflow-hidden rounded-xl bg-ink text-white">
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <p id="pickup-label" className="text-xs font-medium tracking-[0.14em] text-white/70 uppercase">
            Pickup number
          </p>
          <p className="tabular mt-2 text-[84px] leading-none font-semibold tracking-[-0.04em] sm:text-[104px]">
            {formatPickupNumber(order.pickup_number)}
          </p>
          <p className="mt-3 text-sm text-white/70">Show this at the counter when your order is ready</p>
        </div>
      </section>

      {/* Digital receipt */}
      <section aria-labelledby="receipt-heading" className="print-plain mt-6 rounded-xl border border-line bg-surface p-5 shadow-xs sm:p-7">
        <div className="print-only mb-4">
          <Logo />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="receipt-heading" className="text-base font-semibold">
              Receipt
            </h2>
            <p className="tabular mt-1 text-sm text-ink-muted">{order.order_number}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PaymentStatusBadge status={order.payment_status} />
            <OrderStatusBadge status={order.order_status} />
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 rounded-md bg-surface-muted p-4 text-sm">
          <div>
            <dt className="text-ink-muted">Placed</dt>
            <dd className="tabular mt-0.5 font-medium">{formatDateTime(order.placed_at ?? order.created_at)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Name</dt>
            <dd className="mt-0.5 truncate font-medium">{order.customer_name || '—'}</dd>
          </div>
        </dl>

        <OrderItemsList items={order.order_items} className="mt-4" />
        <PriceBreakdown
          className="mt-2 border-t border-line pt-4"
          subtotalPaise={order.subtotal_paise}
          chargesPaise={order.charges_paise}
          totalPaise={order.total_paise}
          totalLabel={simulated ? 'Total (simulated)' : 'Total paid'}
        />
        {order.note && (
          <p className="mt-4 rounded-md bg-surface-muted px-3.5 py-2.5 text-sm">
            <span className="font-medium">Note: </span>
            {order.note}
          </p>
        )}
      </section>

      <div className="no-print mt-8 grid gap-3 sm:grid-cols-3">
        <Button asChild size="lg" className="sm:col-span-1">
          <Link to={`/orders/${order.id}`}>
            Track order <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/menu">Back to menu</Link>
        </Button>
        <Button size="lg" variant="ghost" onClick={() => window.print()}>
          <Printer aria-hidden /> Print receipt
        </Button>
      </div>
    </div>
  );
}
