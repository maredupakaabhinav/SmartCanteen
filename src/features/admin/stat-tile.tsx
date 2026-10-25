import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/cn';

/** Headline metric. Values always come from database queries. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  to,
  loading,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  to?: string;
  loading?: boolean;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-muted">{label}</p>
        {icon && <span className="text-ink-subtle [&_svg]:size-4">{icon}</span>}
      </div>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-20 rounded" aria-hidden />
      ) : (
        <p className={cn('tabular mt-2 text-[28px] leading-9 font-semibold tracking-tight', emphasis && 'text-brand-ink')}>{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </>
  );
  const cls = cn(
    'block rounded-lg border bg-surface p-4 shadow-xs sm:p-5',
    emphasis ? 'border-brand/25' : 'border-line',
    to && 'transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm focus-visible:shadow-(--shadow-focus) focus-visible:outline-none',
  );
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
