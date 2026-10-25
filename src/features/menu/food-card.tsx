import { memo } from 'react';
import { Link } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import { FoodImage, Price, QuantityStepper, VegMark } from '@/components/common';
import { cart, MAX_QUANTITY, useCartQuantity } from '@/features/cart/cart-store';
import { cn } from '@/lib/cn';
import { navigateTo } from '@/lib/navigation';
import type { MenuItem } from '@/types/database';
import { stockLabel } from './queries';

export function addToCart(item: MenuItem, quantity = 1) {
  cart.add({ itemId: item.id, name: item.name, pricePaise: item.price_paise, imageUrl: item.image_url }, quantity);
  toast.success(`${item.name} added`, {
    id: `added-${item.id}`,
    description: quantity > 1 ? `${quantity} in your cart` : undefined,
    action: { label: 'View cart', onClick: () => navigateTo('/cart') },
  });
}

/** Max that can be added: the tracked stock, capped at the per-item limit. */
export function maxQuantityFor(item: MenuItem) {
  return item.stock_quantity === null ? MAX_QUANTITY : Math.min(MAX_QUANTITY, item.stock_quantity);
}

interface FoodCardProps {
  item: MenuItem;
  /** Real popularity badge (units sold from paid orders), when available. */
  popularUnits?: number;
  priority?: boolean;
}

export const FoodCard = memo(function FoodCard({ item, popularUnits, priority }: FoodCardProps) {
  const quantity = useCartQuantity(item.id);
  const { available, label } = stockLabel(item);
  const reduce = useReducedMotion();
  const detailHref = `?item=${item.id}`;

  return (
    <motion.article
      layout={reduce ? false : 'position'}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xs',
        'transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md',
      )}
      aria-labelledby={`item-${item.id}-name`}
    >
      <Link to={detailHref} preventScrollReset className="relative block focus-visible:outline-none" tabIndex={-1} aria-hidden>
        <FoodImage
          src={item.image_url}
          alt=""
          priority={priority}
          className={cn('aspect-[4/3] w-full', !available && 'opacity-60 grayscale-[60%]')}
          width={480}
        />
        {!available && (
          <span className="absolute top-3 left-3 rounded-full bg-ink/85 px-2.5 py-1 text-xs font-medium text-white">
            {label}
          </span>
        )}
        {available && popularUnits ? (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-medium text-ink shadow-xs">
            <Star className="size-3.5 fill-warning-strong text-warning-strong" aria-hidden />
            Popular
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          <VegMark vegetarian={item.is_vegetarian} className="mt-[3px]" />
          <h3 id={`item-${item.id}-name`} className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">
            <Link
              to={detailHref}
              preventScrollReset
              className="rounded-xs after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:shadow-(--shadow-focus)"
            >
              {item.name}
            </Link>
          </h3>
        </div>
        {item.description && <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-ink-muted">{item.description}</p>}
        {available && label && <p className="mt-2 text-xs font-medium text-warning">{label}</p>}

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <Price paise={item.price_paise} className="text-[15px]" />
          {/* Controls sit above the card-wide link */}
          <div className="relative z-10">
            {!available ? (
              <span className="text-xs font-medium text-ink-muted" aria-label={`${item.name} is ${label?.toLowerCase()}`}>
                {label}
              </span>
            ) : quantity > 0 ? (
              <QuantityStepper
                size="sm"
                value={quantity}
                max={maxQuantityFor(item)}
                label={item.name}
                onChange={(q) => cart.setQuantity(item.id, q)}
              />
            ) : (
              <button
                type="button"
                onClick={() => addToCart(item)}
                aria-label={`Add ${item.name} to cart`}
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-full border border-brand/25 bg-brand-softer px-3.5 text-sm font-semibold text-brand-ink',
                  'transition-[background-color,border-color,transform] duration-150 hover:border-brand hover:bg-brand hover:text-white active:scale-95',
                  'focus-visible:shadow-(--shadow-focus) focus-visible:outline-none',
                )}
              >
                <Plus className="size-4" aria-hidden /> Add
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
});

export function FoodCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface" aria-hidden>
      <div className="skeleton aspect-[4/3] w-full" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="flex items-center justify-between pt-3">
          <div className="skeleton h-4 w-12 rounded" />
          <div className="skeleton h-9 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}
