import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CircleAlert, CreditCard, FlaskConical, Radio, Receipt, RefreshCw, SearchX, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, Notice } from '@/components/common';
import { orderKeys, useOrder } from '@/features/orders/queries';
import { OrderItemsList, OrderProgress, OrderStatusBadge, PaymentStatusBadge } from '@/features/orders/order-ui';
import { ORDER_STATUS } from '@/features/orders/status';
import { reconcilePayment, usePaymentConfig } from '@/features/orders/payment';
import { usePayOrder } from '@/features/orders/use-pay-order';
import { PriceBreakdown } from '@/features/cart/order-summary';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime, formatPickupNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/use-document-title';

export default function OrderTrackingPage() {
  const { orderId } = useParams();
  const queryClient = useQueryClient();
  const { data: order, isPending, isError, error, refetch, live, dataUpdatedAt, isFetching } = useOrder(orderId);
  const paymentConfig = usePaymentConfig();
  const { state: payState, pay, busy } = usePayOrder();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const reconciled = useRef(false);
  useDocumentTitle(order ? `Order #${formatPickupNumber(order.pickup_number)}` : 'Track order');

  // If an unpaid order may actually have been paid (browser closed mid-checkout), ask the server to check.
  useEffect(() => {
    if (!order || reconciled.current || order.order_status !== 'awaiting_payment') return;
    if (paymentConfig.data?.mode !== 'razorpay') return;
    reconciled.current = true;
    reconcilePayment(order.id)
      .then((res) => {
        if (res.order.paymentStatus === 'paid') void queryClient.invalidateQueries({ queryKey: orderKeys.detail(order.id) });
      })
      .catch(() => undefined);
  }, [order, paymentConfig.data?.mode, queryClient]);

  // Announce status changes to screen-reader users and with a toast.
  const lastStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!order) return;
    if (lastStatus.current && lastStatus.current !== order.order_status) {
      const meta = ORDER_STATUS[order.order_status];
      if (order.order_status === 'ready') toast.success('Your order is ready for pickup!', { description: `Show #${formatPickupNumber(order.pickup_number)} at the counter.` });
      else toast(meta.label, { description: meta.description });
    }
    lastStatus.current = order.order_status;
  }, [order]);

  if (isPending) {
    return (
      <div className="page-container max-w-3xl py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-8 h-40 w-full rounded-xl" />
        <Skeleton className="mt-6 h-56 w-full rounded-xl" />
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

  const meta = ORDER_STATUS[order.order_status];
  const awaitingPayment = order.order_status === 'awaiting_payment';
  const closed = order.order_status === 'rejected' || order.order_status === 'cancelled';
  const ready = order.order_status === 'ready';

  async function cancel() {
    const { error: err } = await supabase.rpc('cancel_unpaid_order', { p_order_id: order!.id });
    if (err) {
      toast.error(getErrorMessage(err));
      throw err;
    }
    toast.success('Order cancelled');
    void queryClient.invalidateQueries({ queryKey: orderKeys.all });
  }

  return (
    <div className="page-container max-w-3xl pt-6 pb-16 sm:pt-10">
      <Link to="/orders" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> My orders
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">
            {order.pickup_number ? `Order #${formatPickupNumber(order.pickup_number)}` : 'Your order'}
          </h1>
          <p className="tabular mt-1 text-sm text-ink-muted">
            {order.order_number} · {formatDateTime(order.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PaymentStatusBadge status={order.payment_status} />
          <OrderStatusBadge status={order.order_status} />
        </div>
      </header>

      {/* Screen-reader announcement of the current status */}
      <p className="sr-only" role="status" aria-live="polite">
        Order status: {meta.label}. {meta.description}
      </p>

      {awaitingPayment && (
        <section className="mt-8 rounded-xl border border-warning-strong/25 bg-warning-soft p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <CreditCard className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-[#6f4810]">Payment pending</h2>
              <p className="mt-1 text-sm text-[#6f4810]/90">
                This order isn’t sent to the kitchen until payment is verified. Unpaid orders are released after 30 minutes.
              </p>
              {payState.kind === 'failed' && <p className="mt-2 text-sm font-medium text-danger">{payState.message}</p>}
              {payState.kind === 'dismissed' && <p className="mt-2 text-sm font-medium text-[#6f4810]">Payment window closed before completion.</p>}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => pay(order.id)}
                  loading={busy}
                  loadingText={payState.kind === 'verifying' ? 'Verifying…' : 'Opening payment…'}
                  disabled={paymentConfig.data?.mode === 'disabled'}
                >
                  {paymentConfig.data?.mode === 'demo' ? <FlaskConical aria-hidden /> : <CreditCard aria-hidden />}
                  {paymentConfig.data?.mode === 'demo' ? 'Simulate payment (demo)' : 'Complete payment'}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(true)} disabled={busy}>
                  Cancel order
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {closed && (
        <Notice
          className="mt-8"
          tone={order.order_status === 'rejected' ? 'danger' : 'neutral'}
          icon={<Ban />}
          title={order.order_status === 'rejected' ? 'The canteen couldn’t accept this order' : 'Order cancelled'}
        >
          {order.status_note ?? meta.description}
          {order.payment_status === 'paid' && (
            <span className="mt-1 block">Your payment was received — please contact the canteen counter about a refund.</span>
          )}
        </Notice>
      )}

      {!awaitingPayment && !closed && (
        <>
          <section
            aria-label="Pickup number"
            className={cn(
              'mt-8 flex flex-col items-center gap-2 rounded-xl px-6 py-8 text-center transition-colors duration-500 sm:flex-row sm:justify-between sm:text-left',
              ready ? 'bg-brand text-white' : 'bg-ink text-white',
            )}
          >
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-white/70 uppercase">Pickup number</p>
              <p className="tabular text-[72px] leading-none font-semibold tracking-[-0.04em]">{formatPickupNumber(order.pickup_number)}</p>
            </div>
            <div className="max-w-xs sm:text-right">
              <p className="text-lg font-semibold">{meta.label}</p>
              <p className="mt-1 text-sm text-white/75">{meta.description}</p>
            </div>
          </section>

          <section aria-labelledby="progress-heading" className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-7">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 id="progress-heading" className="text-base font-semibold">
                Progress
              </h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                {live ? (
                  <>
                    <Radio className="size-3.5 text-brand" aria-hidden /> Live updates
                  </>
                ) : (
                  <>
                    <RefreshCw className={cn('size-3.5', isFetching && 'animate-spin')} aria-hidden /> Updated {formatRelative(new Date(dataUpdatedAt).toISOString())}
                  </>
                )}
              </span>
            </div>
            <OrderProgress status={order.order_status} order={order} />
          </section>

          {order.order_status !== 'completed' && (
            <Notice tone="neutral" icon={<Store />} className="mt-6" title="Pickup instructions">
              Keep this page open. When the status changes to <strong>Ready for pickup</strong>, go to the canteen counter and
              show pickup number <strong className="tabular">{formatPickupNumber(order.pickup_number)}</strong>.
            </Notice>
          )}
        </>
      )}

      <section aria-labelledby="items-heading" className="mt-6 rounded-xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <h2 id="items-heading" className="text-base font-semibold">
            Items
          </h2>
          {(order.payment_status === 'paid' || order.payment_status === 'simulated') && (
            <Link to={`/orders/${order.id}/confirmation`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
              <Receipt className="size-4" aria-hidden /> Receipt
            </Link>
          )}
        </div>
        <OrderItemsList items={order.order_items} className="mt-2" />
        <PriceBreakdown
          className="mt-2 border-t border-line pt-4"
          subtotalPaise={order.subtotal_paise}
          chargesPaise={order.charges_paise}
          totalPaise={order.total_paise}
        />
        {order.note && (
          <p className="mt-4 flex gap-2 rounded-md bg-surface-muted px-3.5 py-2.5 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
            <span>
              <span className="font-medium">Your note: </span>
              {order.note}
            </span>
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this order?"
        description="The items will be released back to the menu. You can place a new order any time."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        tone="danger"
        onConfirm={cancel}
      />
    </div>
  );
}
