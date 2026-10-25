import { useState, type ReactNode } from 'react';
import { Minus, Plus, RotateCw, TriangleAlert, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatPrice } from '@/lib/format';
import { Button } from './ui/button';

/* ---------------------------------------------------------------- Page header */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] sm:text-[32px] sm:leading-10">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ---------------------------------------------------------------- Price */
export function Price({ paise, className, strike }: { paise: number; className?: string; strike?: boolean }) {
  return (
    <span className={cn('tabular font-semibold text-ink', strike && 'font-normal text-ink-subtle line-through', className)}>
      {formatPrice(paise)}
    </span>
  );
}

/* ---------------------------------------------------------------- Veg mark */
/** Indian food-type mark. Shown only when the canteen has specified it. */
export function VegMark({ vegetarian, className }: { vegetarian: boolean | null; className?: string }) {
  if (vegetarian === null) return null;
  const label = vegetarian ? 'Vegetarian' : 'Non-vegetarian';
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-surface',
        vegetarian ? 'border-veg' : 'border-nonveg',
        className,
      )}
    >
      {vegetarian ? (
        <span className="size-2 rounded-full bg-veg" />
      ) : (
        <span className="size-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-nonveg" />
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- Food image */
/** Photo with a fixed aspect ratio, lazy loading and a designed fallback. */
export function FoodImage({
  src,
  alt,
  className,
  sizes = '(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw',
  priority = false,
  width = 640,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  width?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn('flex items-center justify-center bg-surface-muted text-ink-subtle', className)}
      >
        <UtensilsCrossed className="size-7" aria-hidden strokeWidth={1.5} />
      </div>
    );
  }

  const isUnsplash = src.startsWith('https://images.unsplash.com/');
  const url = (w: number) => (isUnsplash ? `${src}?w=${w}&q=72&auto=format&fit=crop` : src);
  const srcSet = isUnsplash ? [320, 480, 640, 960, 1280].filter((w) => w <= width * 2).map((w) => `${url(w)} ${w}w`).join(', ') : undefined;

  return (
    <div className={cn('relative overflow-hidden bg-surface-muted', className)}>
      <img
        src={url(width)}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        // Cached images can finish before React attaches onLoad, so also check on mount.
        ref={(img) => {
          if (img?.complete && img.naturalWidth > 0) setLoaded(true);
        }}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          'absolute inset-0 size-full object-cover object-center transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Quantity stepper */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = 20,
  label,
  size = 'md',
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const btn = size === 'sm' ? 'size-8' : 'size-10';
  return (
    <div
      role="group"
      aria-label={`Quantity for ${label}`}
      className={cn('inline-flex items-center rounded-full border border-line-strong bg-surface shadow-xs', className)}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={value === 1 && min === 0 ? `Remove ${label}` : `Decrease ${label}`}
        className={cn(
          btn,
          'inline-flex items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-muted active:scale-95 disabled:opacity-40',
          'focus-visible:shadow-(--shadow-focus) focus-visible:outline-none',
        )}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <span aria-live="polite" className={cn('tabular min-w-7 text-center text-sm font-semibold', size === 'sm' && 'min-w-6')}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
        className={cn(
          btn,
          'inline-flex items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-muted active:scale-95 disabled:opacity-40',
          'focus-visible:shadow-(--shadow-focus) focus-visible:outline-none',
        )}
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- Empty & error states */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted [&_svg]:size-6">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-sm leading-6 text-ink-muted">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'We couldn’t load this',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <TriangleAlert className="size-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-ink-muted">
        {message ?? 'Please check your connection and try again.'}
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          <RotateCw aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Notice */
export function Notice({
  tone = 'neutral',
  icon,
  title,
  children,
  className,
}: {
  tone?: 'neutral' | 'brand' | 'warning' | 'danger' | 'info';
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'border-line bg-surface-muted text-ink',
    brand: 'border-brand/15 bg-brand-softer text-brand-ink',
    warning: 'border-warning-strong/25 bg-warning-soft text-[#6f4810]',
    danger: 'border-danger/20 bg-danger-soft text-[#7f2318]',
    info: 'border-info/15 bg-info-soft text-[#24476b]',
  };
  return (
    <div className={cn('flex gap-3 rounded-md border px-4 py-3 text-sm leading-6', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-[18px]">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}
