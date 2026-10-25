import { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { OrderStatusBadge } from '@/features/orders/order-ui';
import { NEXT_STAFF_ACTION, REJECTABLE } from '@/features/orders/status';
import { cn } from '@/lib/cn';
import { formatPickupNumber, formatPrice, formatRelative, formatTime } from '@/lib/format';
import type { OrderWithItems } from '@/types/database';
import { useUpdateOrderStatus } from './queries';
import { useNow } from '@/lib/use-now';

const QUICK_REASONS = ['Item ran out', 'Kitchen closing', 'Duplicate order'];

/** A kitchen ticket: big pickup number, items, and the one next action. */
export function OrderTicket({ order }: { order: OrderWithItems }) {
  const update = useUpdateOrderStatus();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const next = NEXT_STAFF_ACTION[order.order_status];
  const pending = update.isPending;
  const simulated = order.payment_status === 'simulated';
  const now = useNow(30_000);
  const ageMinutes = order.placed_at ? (now - new Date(order.placed_at).getTime()) / 60000 : 0;
  const waitingLong = order.order_status === 'placed' && ageMinutes > 5;

  return (
    <article
      className={cn(
        'flex flex-col rounded-lg border bg-surface shadow-xs',
        order.order_status === 'placed' ? 'border-info/30' : order.order_status === 'ready' ? 'border-brand/30' : 'border-line',
      )}
      aria-label={`Order ${formatPickupNumber(order.pickup_number)}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
        <div className="min-w-0">
          <p className="tabular text-[28px] leading-none font-semibold tracking-tight">#{formatPickupNumber(order.pickup_number)}</p>
          <p className="mt-1.5 truncate text-sm font-medium">{order.customer_name || 'Student'}</p>
          <p className="tabular text-xs text-ink-muted">
            {order.order_number} · {order.placed_at ? `${formatTime(order.placed_at)} (${formatRelative(order.placed_at)})` : formatTime(order.created_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <OrderStatusBadge status={order.order_status} />
          {simulated ? (
            <Badge tone="info">Demo payment</Badge>
          ) : order.payment_status === 'paid' ? (
            <Badge tone="brand">Paid</Badge>
          ) : (
            <Badge tone="warning">Unpaid</Badge>
          )}
          {waitingLong && <Badge tone="warning">Waiting {Math.round(ageMinutes)} min</Badge>}
        </div>
      </header>

      <ul className="flex-1 space-y-1.5 px-4 py-3.5">
        {order.order_items.map((it) => (
          <li key={it.id} className="flex gap-2.5 text-[15px]">
            <span className="tabular w-7 shrink-0 font-semibold">{it.quantity}×</span>
            <span className="min-w-0">{it.item_name_snapshot}</span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="mx-4 mb-3 flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-[#6f4810]">
          <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
          {order.note}
        </p>
      )}
      {order.status_note && (order.order_status === 'rejected' || order.order_status === 'cancelled') && (
        <p className="mx-4 mb-3 rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-muted">{order.status_note}</p>
      )}

      <footer className="flex items-center gap-2 border-t border-line px-4 py-3">
        <span className="tabular mr-auto text-sm font-semibold">{formatPrice(order.total_paise)}</span>
        {REJECTABLE.includes(order.order_status) && (
          <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" onClick={() => setRejecting(true)} disabled={pending}>
            Reject
          </Button>
        )}
        {next && (
          <Button
            size="sm"
            variant={order.order_status === 'preparing' ? 'primary' : order.order_status === 'ready' ? 'outline' : 'primary'}
            loading={pending}
            onClick={() => update.mutate({ order, to: next.to })}
          >
            {next.label}
          </Button>
        )}
      </footer>

      <ConfirmDialog
        open={rejecting}
        onOpenChange={(o) => {
          setRejecting(o);
          if (!o) setReason('');
        }}
        title={`Reject order #${formatPickupNumber(order.pickup_number)}?`}
        description="The student sees your reason on their tracking page. Reserved stock is returned to the menu."
        confirmLabel="Reject order"
        tone="danger"
        confirmDisabled={reason.trim().length < 3}
        onConfirm={() => update.mutateAsync({ order, to: 'rejected', note: reason.trim() })}
      >
        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                'h-8 rounded-full border px-3 text-sm transition-colors',
                reason === r ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-surface-muted',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Field label="Reason" className="mt-4" hint={order.payment_status === 'paid' ? 'This order was paid — arrange the refund at the counter.' : undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={2} />
        </Field>
      </ConfirmDialog>
    </article>
  );
}
