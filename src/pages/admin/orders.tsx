import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Inbox, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Input } from '@/components/ui/input';
import { useOrderQueue } from '@/features/admin/queries';
import { OrderTicket } from '@/features/admin/order-ticket';
import { getErrorMessage } from '@/lib/errors';
import { useDocumentTitle } from '@/lib/use-document-title';
import type { OrderStatus, OrderWithItems } from '@/types/database';

const TABS: { id: string; label: string; statuses: OrderStatus[]; empty: string }[] = [
  { id: 'new', label: 'New', statuses: ['placed'], empty: 'No new orders. New paid orders appear here instantly.' },
  { id: 'kitchen', label: 'In kitchen', statuses: ['accepted', 'preparing'], empty: 'Nothing is being prepared right now.' },
  { id: 'ready', label: 'Ready', statuses: ['ready'], empty: 'No orders are waiting for pickup.' },
  { id: 'done', label: 'Completed', statuses: ['completed'], empty: 'No orders completed in the last 18 hours.' },
  { id: 'closed', label: 'Rejected & cancelled', statuses: ['rejected', 'cancelled'], empty: 'No rejected or cancelled orders recently.' },
  { id: 'unpaid', label: 'Awaiting payment', statuses: ['awaiting_payment'], empty: 'No unpaid orders. These are not sent to the kitchen.' },
];

export default function AdminOrdersPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab')! : 'new';
  const [query, setQuery] = useState('');
  const { data, isPending, isError, error, refetch } = useOrderQueue();

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '');
    const match = (o: OrderWithItems) =>
      !q ||
      String(o.pickup_number ?? '').padStart(3, '0').includes(q) ||
      o.order_number.toLowerCase().includes(q) ||
      o.customer_name.toLowerCase().includes(q);
    return Object.fromEntries(TABS.map((t) => [t.id, (data ?? []).filter((o) => t.statuses.includes(o.order_status) && match(o))]));
  }, [data, query]);

  const newCount = grouped.new?.length ?? 0;
  useDocumentTitle(newCount ? `(${newCount}) Orders` : 'Orders');

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Live queue. Paid orders appear in New as soon as payment is verified."
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <label htmlFor="queue-search" className="sr-only">
              Find an order
            </label>
            <Input id="queue-search" placeholder="Pickup no., order no. or name" value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 pl-9 text-sm" />
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="mt-6">
        <TabsList aria-label="Order status">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
              <span className="tabular rounded-full bg-surface-muted px-1.5 text-xs text-ink-muted group-data-[state=active]:bg-surface-muted">
                {isPending ? '–' : (grouped[t.id]?.length ?? 0)}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-6 focus-visible:outline-none">
            {isPending ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-64 rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              <ErrorState message={getErrorMessage(error)} onRetry={() => refetch()} />
            ) : grouped[t.id]!.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line-strong bg-surface/60">
                <EmptyState icon={<Inbox />} title={query ? 'No matching orders' : 'All clear'} description={t.empty} />
              </div>
            ) : (
              <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {grouped[t.id]!.map((o) => (
                  <OrderTicket key={o.id} order={o} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
