import { useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatPrice, formatTime } from '@/lib/format';
import type { OrderItem, OrderStatus, PaymentStatus } from '@/types/database';
import { ORDER_STATUS, PAYMENT_STATUS, PROGRESS_STEPS, progressIndex, timestampFor } from './status';

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS[status];
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const meta = PAYMENT_STATUS[status];
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

type Timestamps = Parameters<typeof timestampFor>[1];

/** Placed → Accepted → Preparing → Ready → Completed. */
export function OrderProgress({ status, order }: { status: OrderStatus; order: Timestamps }) {
  const current = progressIndex(status);
  const reduce = useReducedMotion();
  return (
    <ol className="relative grid gap-0 sm:grid-cols-5" aria-label="Order progress">
      {PROGRESS_STEPS.map((step, i) => {
        const done = i < current || (i === current && status === 'completed');
        const active = i === current && status !== 'completed';
        const ts = timestampFor(step.status, order);
        return (
          <li
            key={step.status}
            className="relative flex gap-4 pb-6 last:pb-0 sm:flex-col sm:items-center sm:gap-3 sm:pb-0 sm:text-center"
            aria-current={active ? 'step' : undefined}
          >
            {/* connector */}
            {i < PROGRESS_STEPS.length - 1 && (
              <span
                aria-hidden
                className="absolute top-8 bottom-0 left-[15px] w-0.5 bg-line sm:top-[15px] sm:right-[calc(-50%+18px)] sm:bottom-auto sm:left-[calc(50%+18px)] sm:h-0.5 sm:w-auto"
              >
                <span
                  className={cn(
                    'block size-full origin-top bg-brand transition-[scale] duration-500 ease-(--ease-out-soft) sm:origin-left',
                    i < current ? 'scale-100' : 'scale-y-0 sm:scale-x-0 sm:scale-y-100',
                  )}
                />
              </span>
            )}
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors duration-300',
                done && 'border-brand bg-brand text-white',
                active && 'border-brand bg-surface text-brand',
                !done && !active && 'border-line-strong bg-surface text-ink-subtle',
              )}
            >
              {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : i + 1}
              {active && !reduce && (
                <span className="absolute inset-[-5px] animate-ping rounded-full border-2 border-brand/30 [animation-duration:2s]" aria-hidden />
              )}
            </span>
            <span className="min-w-0 pt-1 sm:pt-0">
              <span className={cn('block text-sm font-medium', !done && !active && 'text-ink-muted')}>{step.label}</span>
              <span className="tabular block text-xs text-ink-muted">
                {ts ? formatTime(ts) : active ? 'In progress' : ' '}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderItemsList({ items, className }: { items: OrderItem[]; className?: string }) {
  return (
    <ul className={cn('divide-y divide-line', className)}>
      {items.map((it) => (
        <li key={it.id} className="flex items-baseline justify-between gap-4 py-3 text-sm">
          <span className="min-w-0">
            <span className="tabular mr-2 font-semibold">{it.quantity}×</span>
            {it.item_name_snapshot}
            <span className="tabular ml-2 text-xs text-ink-muted">@ {formatPrice(it.unit_price_paise)}</span>
          </span>
          <span className="tabular shrink-0 font-medium">{formatPrice(it.line_total_paise)}</span>
        </li>
      ))}
    </ul>
  );
}
