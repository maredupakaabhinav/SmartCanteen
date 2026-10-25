import type { ReactNode } from 'react';
import { Price } from '@/components/common';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';

/** Transparent price breakdown used by cart, checkout and receipts. */
export function PriceBreakdown({
  subtotalPaise,
  chargesPaise,
  totalPaise,
  className,
  totalLabel = 'Total',
}: {
  subtotalPaise: number;
  chargesPaise: number;
  totalPaise: number;
  className?: string;
  totalLabel?: string;
}) {
  return (
    <dl className={cn('space-y-2.5 text-sm', className)}>
      <Row label="Item total">
        <Price paise={subtotalPaise} className="font-medium" />
      </Row>
      <Row label="Service charge">
        {chargesPaise > 0 ? <Price paise={chargesPaise} className="font-medium" /> : <span className="text-ink-muted">None</span>}
      </Row>
      <div className="flex items-baseline justify-between border-t border-dashed border-line-strong pt-3">
        <dt className="text-[15px] font-semibold">{totalLabel}</dt>
        <dd className="tabular text-lg font-semibold" aria-label={`${totalLabel} ${formatPrice(totalPaise)}`}>
          {formatPrice(totalPaise)}
        </dd>
      </div>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
