import { Link } from 'react-router';
import { ArrowRight, CircleCheck, CookingPot, FlaskConical, IndianRupee, PackageCheck, ReceiptText, ShoppingBasket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, Notice, PageHeader } from '@/components/common';
import { StatTile } from '@/features/admin/stat-tile';
import { useAdminOverview, useOrderQueue, useTopItems } from '@/features/admin/queries';
import { useSettings } from '@/features/menu/queries';
import { getOpenState } from '@/features/menu/hours';
import { OrderStatusBadge } from '@/features/orders/order-ui';
import { getErrorMessage } from '@/lib/errors';
import { formatPickupNumber, formatPrice, formatRelative, formatShortDay } from '@/lib/format';
import { useDocumentTitle } from '@/lib/use-document-title';

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function BestSellers({ today }: { today: string }) {
  const from = addDays(today, -6);
  const { data, isPending, isError } = useTopItems(from, today, 5);
  const max = Math.max(1, ...(data ?? []).map((d) => d.unitsPaid));
  return (
    <section aria-labelledby="best-heading" className="rounded-lg border border-line bg-surface p-5 shadow-xs sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="best-heading" className="text-base font-semibold">
          Best sellers
        </h2>
        <span className="text-xs text-ink-muted">
          {formatShortDay(from)} – {formatShortDay(today)} · paid orders
        </span>
      </div>
      {isPending ? (
        <div className="mt-5 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="mt-5 text-sm text-danger">Couldn’t load best sellers.</p>
      ) : !data?.some((d) => d.unitsPaid > 0) ? (
        <p className="mt-5 text-sm text-ink-muted">No paid orders in the last 7 days yet. Best sellers appear once real orders come in.</p>
      ) : (
        <ol className="mt-5 space-y-3.5">
          {data
            .filter((d) => d.unitsPaid > 0)
            .map((d, i) => (
              <li key={d.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="tabular mr-2 text-ink-muted">{i + 1}.</span>
                    {d.name}
                  </span>
                  <span className="tabular shrink-0 font-medium">{d.unitsPaid} sold</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted" aria-hidden>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(d.unitsPaid / max) * 100}%` }} />
                </div>
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}

function NeedsAttention() {
  const { data, isPending } = useOrderQueue();
  const orders = (data ?? []).filter((o) => ['placed', 'accepted', 'preparing', 'ready'].includes(o.order_status)).slice(0, 6);
  return (
    <section aria-labelledby="queue-heading" className="rounded-lg border border-line bg-surface shadow-xs">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 id="queue-heading" className="text-base font-semibold">
          Active queue
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/orders">
            Open queue <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
      {isPending ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <p className="px-5 pt-3 pb-6 text-sm text-ink-muted sm:px-6">No active orders. New paid orders will appear here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {orders.map((o) => (
            <li key={o.id} className="flex items-center gap-4 px-5 py-3 sm:px-6">
              <span className="tabular w-12 text-lg font-semibold">#{formatPickupNumber(o.pickup_number)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{o.customer_name || 'Student'}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {o.order_items.map((i) => `${i.quantity}× ${i.item_name_snapshot}`).join(', ')}
                </span>
              </span>
              <span className="hidden text-xs text-ink-muted sm:block">{o.placed_at && formatRelative(o.placed_at)}</span>
              <OrderStatusBadge status={o.order_status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminOverviewPage() {
  useDocumentTitle('Staff dashboard');
  const { data, isPending, isError, error, refetch } = useAdminOverview();
  const { data: settings } = useSettings();
  const open = settings ? getOpenState(settings) : null;

  if (isError) return <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today"
        description={
          data ? `Business date ${formatShortDay(data.business_date)} · ${open?.label ?? ''}` : 'Live figures from today’s orders.'
        }
        actions={
          <Button asChild>
            <Link to="/admin/orders">
              Order queue <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />

      {data && data.simulated_today > 0 && (
        <Notice tone="info" icon={<FlaskConical />}>
          {data.simulated_today} demo {data.simulated_today === 1 ? 'order' : 'orders'} with simulated payment today — counted in orders, excluded from revenue.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Orders today" value={data?.orders_today ?? 0} loading={isPending} icon={<ReceiptText />} />
        <StatTile
          label="Revenue"
          value={formatPrice(data?.revenue_today_paise ?? 0)}
          hint="Verified payments only"
          loading={isPending}
          icon={<IndianRupee />}
          emphasis
        />
        <StatTile label="New" value={data?.new_orders ?? 0} hint="Waiting to accept" loading={isPending} icon={<ShoppingBasket />} to="/admin/orders?tab=new" />
        <StatTile label="In kitchen" value={data?.in_kitchen ?? 0} hint="Accepted or preparing" loading={isPending} icon={<CookingPot />} to="/admin/orders?tab=kitchen" />
        <StatTile label="Ready" value={data?.ready ?? 0} hint="Awaiting pickup" loading={isPending} icon={<PackageCheck />} to="/admin/orders?tab=ready" />
        <StatTile label="Completed" value={data?.completed_today ?? 0} hint="Collected today" loading={isPending} icon={<CircleCheck />} to="/admin/orders?tab=done" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <NeedsAttention />
        {data ? <BestSellers today={data.business_date} /> : <Skeleton className="h-72 rounded-lg" />}
      </div>
    </div>
  );
}
