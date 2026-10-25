import { Link } from 'react-router';
import { ArrowRight, Info, ShoppingBag, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, FoodImage, Notice, PageHeader, Price, QuantityStepper, VegMark } from '@/components/common';
import { Skeleton } from '@/components/ui/skeleton';
import { cart, MAX_QUANTITY } from '@/features/cart/cart-store';
import { useValidatedCart, type ValidatedLine } from '@/features/cart/use-validated-cart';
import { PriceBreakdown } from '@/features/cart/order-summary';
import { useAuth } from '@/features/auth/auth-context';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { formatPrice, pluralize } from '@/lib/format';
import { useDocumentTitle } from '@/lib/use-document-title';

function CartRow({ line }: { line: ValidatedLine }) {
  const blocked = line.issue === 'removed' || line.issue === 'unavailable' || line.issue === 'sold-out';
  const max = line.item?.stock_quantity != null ? Math.min(MAX_QUANTITY, line.item.stock_quantity) : MAX_QUANTITY;
  const unit = line.item?.price_paise ?? line.pricePaise;
  return (
    <li className="flex gap-4 py-5">
      <FoodImage
        src={line.imageUrl}
        alt=""
        width={160}
        sizes="96px"
        className={cn('size-20 shrink-0 rounded-md sm:size-24', blocked && 'opacity-50 grayscale')}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              {line.item && <VegMark vegetarian={line.item.is_vegetarian} />}
              <span className="truncate">{line.name}</span>
            </h3>
            <p className="tabular mt-0.5 text-sm text-ink-muted">{formatPrice(unit)} each</p>
          </div>
          <Price paise={unit * line.quantity} className={cn('text-[15px]', blocked && 'text-ink-subtle line-through')} />
        </div>
        {line.issueText && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-danger" role="status">
            <TriangleAlert className="size-3.5" aria-hidden /> {line.issueText}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          {blocked ? (
            <span className="text-[13px] text-ink-muted">Remove to continue</span>
          ) : (
            <QuantityStepper
              size="sm"
              value={line.quantity}
              min={1}
              max={Math.max(max, 1)}
              label={line.name}
              onChange={(q) => cart.setQuantity(line.itemId, q)}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-ink-muted hover:text-danger"
            onClick={() => cart.remove(line.itemId)}
            aria-label={`Remove ${line.name} from cart`}
          >
            <Trash2 aria-hidden /> <span className="hidden sm:inline">Remove</span>
          </Button>
        </div>
      </div>
    </li>
  );
}

export default function CartPage() {
  useDocumentTitle('Cart');
  const { user } = useAuth();
  const c = useValidatedCart();

  if (c.lines.length === 0) {
    return (
      <div className="page-container py-12">
        <EmptyState
          icon={<ShoppingBag />}
          title="Your cart is empty"
          description="Browse today’s menu and add a few dishes — your cart is saved on this device."
          action={
            <Button asChild size="lg">
              <Link to="/menu">
                Browse the menu <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const closed = c.openState && !c.openState.isOpen;
  const canCheckout = !c.loading && !c.hasIssues && !closed && !c.error;
  const checkoutHref = user ? '/checkout' : `/sign-in?next=${encodeURIComponent('/checkout')}`;
  const ctaLabel = user ? 'Proceed to checkout' : 'Sign in to checkout';

  return (
    <div className="page-container pt-8 pb-36 sm:pt-10 md:pb-12">
      <PageHeader title="Your cart" description={`${pluralize(c.count, 'item')} from the campus canteen`} />

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_320px] md:items-start lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Cart items" className="rounded-lg border border-line bg-surface px-4 sm:px-6">
          {c.error ? (
            <ErrorState message={getErrorMessage(c.error, 'We couldn’t check your cart against the menu.')} />
          ) : (
            <ul className="divide-y divide-line">
              {c.lines.map((line) => (
                <CartRow key={line.itemId} line={line} />
              ))}
            </ul>
          )}
          <div className="border-t border-line py-4">
            <Link to="/menu" className="text-sm font-medium text-brand hover:underline">
              + Add more items
            </Link>
          </div>
        </section>

        <aside aria-label="Order summary" className="md:sticky md:top-[calc(var(--spacing-header)+1.5rem)]">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-xs sm:p-6">
            <h2 className="text-base font-semibold">Order summary</h2>
            {c.loading ? (
              <div className="mt-5 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : (
              <PriceBreakdown className="mt-5" subtotalPaise={c.subtotalPaise} chargesPaise={c.chargesPaise} totalPaise={c.totalPaise} />
            )}

            <div className="mt-5 space-y-3">
              {c.priceChanged && (
                <Notice tone="info" icon={<Info />}>
                  Some prices were updated by the canteen. Totals above use the latest prices.
                </Notice>
              )}
              {c.hasIssues && (
                <Notice tone="danger" icon={<TriangleAlert />}>
                  Some items can’t be ordered right now. Remove or adjust them to continue.
                </Notice>
              )}
              {closed && c.openState && (
                <Notice tone="warning" title={c.openState.label}>
                  {c.openState.detail}
                </Notice>
              )}
            </div>

            <div className="mt-5 hidden md:block">
              <Button asChild={canCheckout} block size="lg" disabled={!canCheckout}>
                {canCheckout ? (
                  <Link to={checkoutHref}>
                    {ctaLabel} <ArrowRight aria-hidden />
                  </Link>
                ) : (
                  <span>{ctaLabel}</span>
                )}
              </Button>
              <p className="mt-3 text-center text-xs text-ink-muted">Final prices are confirmed by the canteen when you place the order.</p>
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile checkout bar — sits above the bottom navigation, never over content */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">Total</p>
            <Price paise={c.totalPaise} className="text-lg" />
          </div>
          <Button asChild={canCheckout} size="lg" className="flex-1" disabled={!canCheckout}>
            {canCheckout ? (
              <Link to={checkoutHref}>
                {ctaLabel} <ArrowRight aria-hidden />
              </Link>
            ) : (
              <span>{ctaLabel}</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
