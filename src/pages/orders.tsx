import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, ChevronRightIcon, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { ORDERS_PAGE_SIZE, useMyOrders } from '@/features/orders/queries';
import { OrderStatusBadge, PaymentStatusBadge } from '@/features/orders/order-ui';
import { isActiveOrder } from '@/features/orders/status';
import { getErrorMessage } from '@/lib/errors';
import { formatDateTime, formatPickupNumber, formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/use-document-title';
import type { OrderWithItems } from '@/types/database';

function summary(order: OrderWithItems) {
  const parts = order.order_items.map((i) => `${i.quantity}× ${i.item_name_snapshot}`);
  return parts.length > 3 ? `${parts.slice(0, 3).join(', ')} +${parts.length - 3} more` : parts.join(', ');
}

function OrderRow({ order }: { order: OrderWithItems }) {
  const active = isActiveOrder(order.order_status);
  return (
    <li>
      <Link
        to={`/orders/${order.id}`}
        className={cn(
          'group flex items-center gap-4 rounded-lg border bg-surface p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm sm:p-5',
          'focus-visible:shadow-(--shadow-focus) focus-visible:outline-none',
          active ? 'border-brand/25' : 'border-line',
        )}
      >
        <div
          className={cn(
            'tabular flex size-14 shrink-0 flex-col items-center justify-center rounded-md text-center',
            active ? 'bg-brand-soft text-brand-ink' : 'bg-surface-muted text-ink',
          )}
        >
          <span className="text-[10px] leading-none font-medium tracking-wide uppercase opacity-70">No.</span>
          <span className="text-lg leading-tight font-semibold">{formatPickupNumber(order.pickup_number)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.order_status} />
            {order.payment_status !== 'paid' && <PaymentStatusBadge status={order.payment_status} />}
          </div>
          <p className="mt-1.5 truncate text-sm font-medium">{summary(order)}</p>
          <p className="tabular mt-0.5 text-xs text-ink-muted">
            {order.order_number} · {formatDateTime(order.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular text-[15px] font-semibold">{formatPrice(order.total_paise)}</span>
          <ChevronRightIcon className="size-5 text-ink-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
      </Link>
    </li>
  );
}

export default function OrdersPage() {
  useDocumentTitle('My orders');
  const [page, setPage] = useState(0);
  const { data, isPending, isError, error, refetch, isFetching } = useMyOrders(page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / ORDERS_PAGE_SIZE)) : 1;
  const active = data?.orders.filter((o) => isActiveOrder(o.order_status)) ?? [];
  const past = data?.orders.filter((o) => !isActiveOrder(o.order_status)) ?? [];

  return (
    <div className="page-container max-w-3xl pt-8 pb-16 sm:pt-10">
      <PageHeader title="My orders" description="Track what’s cooking and find past receipts." />

      <div className="mt-8" aria-busy={isPending || isFetching}>
        {isPending ? (
          <ul className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </ul>
        ) : isError ? (
          <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
        ) : data.total === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title="No orders yet"
            description="When you place an order, you’ll be able to track it and find the receipt here."
            action={
              <Button asChild>
                <Link to="/menu">Browse the menu</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-10">
            {active.length > 0 && (
              <section aria-labelledby="active-heading">
                <h2 id="active-heading" className="mb-3 text-sm font-semibold text-ink-muted">
                  In progress
                </h2>
                <ul className="space-y-3">
                  {active.map((o) => (
                    <OrderRow key={o.id} order={o} />
                  ))}
                </ul>
              </section>
            )}
            {past.length > 0 && (
              <section aria-labelledby="past-heading">
                <h2 id="past-heading" className="mb-3 text-sm font-semibold text-ink-muted">
                  Order history
                </h2>
                <ul className="space-y-3">
                  {past.map((o) => (
                    <OrderRow key={o.id} order={o} />
                  ))}
                </ul>
              </section>
            )}
            {totalPages > 1 && (
              <nav aria-label="Order history pages" className="flex items-center justify-between gap-4">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
                  <ChevronLeft aria-hidden /> Newer
                </Button>
                <span className="tabular text-sm text-ink-muted">
                  Page {page + 1} of {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= totalPages}>
                  Older <ChevronRight aria-hidden />
                </Button>
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
