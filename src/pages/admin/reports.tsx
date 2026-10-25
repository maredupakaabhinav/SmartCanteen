import { useMemo, useState } from 'react';
import { Download, FlaskConical, Table2, ChartColumn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ErrorState, Notice, PageHeader } from '@/components/common';
import { StatTile } from '@/features/admin/stat-tile';
import { BarChart } from '@/features/admin/bar-chart';
import {
  useAdminOverview,
  usePaymentOutcomes,
  useReportDaily,
  useReportSummary,
  useStatusDistribution,
  useTopItems,
} from '@/features/admin/queries';
import { ORDER_STATUS } from '@/features/orders/status';
import { downloadCsv } from '@/lib/csv';
import { getErrorMessage } from '@/lib/errors';
import { formatPrice, formatShortDay, toISODate } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/use-document-title';

type Preset = 'today' | '7d' | '30d' | 'month' | 'custom';

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function rangeFor(preset: Preset, today: string): [string, string] {
  switch (preset) {
    case 'today':
      return [today, today];
    case '7d':
      return [shift(today, -6), today];
    case '30d':
      return [shift(today, -29), today];
    case 'month':
      return [`${today.slice(0, 8)}01`, today];
    default:
      return [shift(today, -6), today];
  }
}

const rupeesAxis = (paise: number) => {
  const r = paise / 100;
  return r >= 1000 ? `₹${(r / 1000).toFixed(r >= 10000 ? 0 : 1)}k` : `₹${Math.round(r)}`;
};

function Panel({ title, children, actions, className }: { title: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-lg border border-line bg-surface p-5 shadow-xs sm:p-6', className)} aria-label={title}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export default function AdminReportsPage() {
  useDocumentTitle('Reports');
  const overview = useAdminOverview();
  const today = overview.data?.business_date ?? toISODate(new Date());
  const [preset, setPreset] = useState<Preset>('7d');
  const [custom, setCustom] = useState<[string, string]>(() => rangeFor('7d', today));
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [from, to] = preset === 'custom' ? custom : rangeFor(preset, today);
  const validRange = from <= to;

  const summary = useReportSummary(from, to);
  const daily = useReportDaily(from, to);
  const top = useTopItems(from, to, 10);
  const payments = usePaymentOutcomes(from, to);
  const statuses = useStatusDistribution(from, to);

  const revenueBars = useMemo(
    () =>
      (daily.data ?? []).map((d) => ({
        key: d.day,
        label: formatShortDay(d.day),
        value: d.revenuePaise,
        display: formatPrice(d.revenuePaise),
        detail: `${d.paidOrders} paid ${d.paidOrders === 1 ? 'order' : 'orders'}`,
      })),
    [daily.data],
  );
  const orderBars = useMemo(
    () =>
      (daily.data ?? []).map((d) => ({
        key: d.day,
        label: formatShortDay(d.day),
        value: d.orders,
        display: `${d.orders} ${d.orders === 1 ? 'order' : 'orders'}`,
        detail: d.simulatedOrders ? `${d.simulatedOrders} demo (simulated)` : undefined,
      })),
    [daily.data],
  );

  const s = summary.data;
  const avg = s && s.paid_orders ? Math.round(s.revenue_paise / s.paid_orders) : 0;
  const statusTotal = (statuses.data ?? []).reduce((a, b) => a + b.orders, 0);

  function exportDaily() {
    downloadCsv(
      `smart-canteen-daily-${from}-to-${to}.csv`,
      ['Date', 'Orders placed', 'Paid orders', 'Verified revenue (INR)', 'Demo orders (simulated)'],
      (daily.data ?? []).map((d) => [d.day, d.orders, d.paidOrders, (d.revenuePaise / 100).toFixed(2), d.simulatedOrders]),
    );
  }
  function exportItems() {
    downloadCsv(
      `smart-canteen-items-${from}-to-${to}.csv`,
      ['Item', 'Units sold (paid)', 'Units (demo)', 'Revenue (INR)'],
      (top.data ?? []).map((t) => [t.name, t.unitsPaid, t.unitsSimulated, (t.revenuePaise / 100).toFixed(2)]),
    );
  }

  const PRESETS: { id: Preset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: 'month', label: 'This month' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="All figures are calculated from recorded orders. Revenue counts verified payments only." />

      {/* Filters: one row above the charts */}
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div role="group" aria-label="Date range" className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => {
                if (p.id === 'custom') setCustom([from, to]);
                setPreset(p.id);
              }}
              className={cn(
                'h-9 rounded-sm px-3 text-sm font-medium transition-colors',
                preset === p.id ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 sm:ml-auto">
            <label className="sr-only" htmlFor="from">From</label>
            <Input id="from" type="date" value={custom[0]} max={today} onChange={(e) => setCustom([e.target.value, custom[1]])} className="h-9 w-auto text-sm" />
            <span className="text-ink-muted">–</span>
            <label className="sr-only" htmlFor="to">To</label>
            <Input id="to" type="date" value={custom[1]} max={today} onChange={(e) => setCustom([custom[0], e.target.value])} className="h-9 w-auto text-sm" />
          </div>
        )}
        {preset !== 'custom' && (
          <p className="tabular text-sm text-ink-muted sm:ml-auto">
            {formatShortDay(from)}
            {from !== to && ` – ${formatShortDay(to)}`}
          </p>
        )}
      </div>

      {!validRange ? (
        <Notice tone="warning">The start date must be on or before the end date.</Notice>
      ) : summary.isError ? (
        <ErrorState message={getErrorMessage(summary.error)} onRetry={() => summary.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile label="Verified revenue" value={formatPrice(s?.revenue_paise ?? 0)} loading={summary.isPending} emphasis />
            <StatTile label="Orders placed" value={s?.orders ?? 0} hint={s ? `${s.completed_orders} completed` : undefined} loading={summary.isPending} />
            <StatTile label="Average paid order" value={formatPrice(avg)} loading={summary.isPending} />
            <StatTile
              label="Rejected"
              value={s?.rejected_orders ?? 0}
              hint={s && s.refund_due_paise > 0 ? `${formatPrice(s.refund_due_paise)} paid — refund due` : undefined}
              loading={summary.isPending}
            />
          </div>

          {s && s.simulated_orders > 0 && (
            <Notice tone="info" icon={<FlaskConical />}>
              {s.simulated_orders} demo {s.simulated_orders === 1 ? 'order' : 'orders'} ({formatPrice(s.simulated_amount_paise)}) used simulated payments
              in this period. They are excluded from revenue.
            </Notice>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
            <Panel
              title="Verified revenue by day"
              actions={
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Show chart" aria-pressed={view === 'chart'} onClick={() => setView('chart')} className={cn(view === 'chart' && 'bg-surface-muted')}>
                    <ChartColumn aria-hidden />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Show table" aria-pressed={view === 'table'} onClick={() => setView('table')} className={cn(view === 'table' && 'bg-surface-muted')}>
                    <Table2 aria-hidden />
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportDaily} disabled={!daily.data?.length}>
                    <Download aria-hidden /> CSV
                  </Button>
                </div>
              }
            >
              {daily.isPending ? (
                <Skeleton className="h-[220px] w-full" />
              ) : view === 'chart' ? (
                <BarChart data={revenueBars} formatAxis={rupeesAxis} ariaLabel="Verified revenue per day" />
              ) : (
                <div className="max-h-[260px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface text-left text-xs text-ink-muted">
                      <tr>
                        <th className="py-2 font-medium">Date</th>
                        <th className="py-2 text-right font-medium">Orders</th>
                        <th className="py-2 text-right font-medium">Paid</th>
                        <th className="py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="tabular divide-y divide-line">
                      {daily.data?.map((d) => (
                        <tr key={d.day}>
                          <td className="py-2">{formatShortDay(d.day)}</td>
                          <td className="py-2 text-right">{d.orders}</td>
                          <td className="py-2 text-right">{d.paidOrders}</td>
                          <td className="py-2 text-right font-medium">{formatPrice(d.revenuePaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Orders placed by day">
              {daily.isPending ? (
                <Skeleton className="h-[220px] w-full" />
              ) : (
                <BarChart data={orderBars} formatAxis={(v) => String(Math.round(v))} ariaLabel="Orders placed per day" />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel
              title="Popular items"
              actions={
                <Button variant="outline" size="sm" onClick={exportItems} disabled={!top.data?.length}>
                  <Download aria-hidden /> CSV
                </Button>
              }
            >
              {top.isPending ? (
                <Skeleton className="h-48 w-full" />
              ) : !top.data?.length ? (
                <p className="text-sm text-ink-muted">No orders in this period.</p>
              ) : (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="text-left text-xs text-ink-muted">
                      <tr className="border-b border-line">
                        <th className="px-1 py-2 font-medium">Item</th>
                        <th className="px-1 py-2 text-right font-medium">Sold (paid)</th>
                        <th className="px-1 py-2 text-right font-medium">Demo</th>
                        <th className="px-1 py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="tabular divide-y divide-line">
                      {top.data.map((t) => (
                        <tr key={t.id}>
                          <td className="px-1 py-2.5 font-medium">{t.name}</td>
                          <td className="px-1 py-2.5 text-right">{t.unitsPaid}</td>
                          <td className="px-1 py-2.5 text-right text-ink-muted">{t.unitsSimulated || '—'}</td>
                          <td className="px-1 py-2.5 text-right">{formatPrice(t.revenuePaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <div className="space-y-6">
              <Panel title="Order status">
                {statuses.isPending ? (
                  <Skeleton className="h-32 w-full" />
                ) : statusTotal === 0 ? (
                  <p className="text-sm text-ink-muted">No orders created in this period.</p>
                ) : (
                  <ul className="space-y-3">
                    {statuses.data!.map((st) => (
                      <li key={st.status}>
                        <div className="flex items-baseline justify-between text-sm">
                          <span>{ORDER_STATUS[st.status].label}</span>
                          <span className="tabular font-medium">
                            {st.orders} <span className="text-xs font-normal text-ink-muted">({Math.round((st.orders / statusTotal) * 100)}%)</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-muted" aria-hidden>
                          <div className="h-full rounded-full bg-ink/70" style={{ width: `${(st.orders / statusTotal) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Payment attempts">
                {payments.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : !payments.data?.length ? (
                  <p className="text-sm text-ink-muted">No payment attempts in this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-ink-muted">
                      <tr className="border-b border-line">
                        <th className="py-2 font-medium">Outcome</th>
                        <th className="py-2 text-right font-medium">Attempts</th>
                        <th className="py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="tabular divide-y divide-line">
                      {payments.data.map((p) => (
                        <tr key={`${p.provider}-${p.status}`}>
                          <td className="py-2.5">
                            <Badge tone={p.status === 'paid' ? 'brand' : p.status === 'failed' ? 'danger' : p.status === 'simulated' ? 'info' : 'neutral'}>
                              {p.provider === 'demo' ? 'Demo · simulated' : `Razorpay · ${p.status === 'created' ? 'not completed' : p.status}`}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-right">{p.attempts}</td>
                          <td className="py-2.5 text-right">{formatPrice(p.amount_paise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
