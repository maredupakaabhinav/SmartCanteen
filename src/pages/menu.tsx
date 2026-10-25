import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Search, SearchX, ShoppingBag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { EmptyState, ErrorState, FoodImage, Notice, Price } from '@/components/common';
import { FoodCard, FoodCardSkeleton } from '@/features/menu/food-card';
import { ItemDialog } from '@/features/menu/item-dialog';
import { stockLabel, useMenu, usePopularItems, useSettings } from '@/features/menu/queries';
import { getOpenState } from '@/features/menu/hours';
import { useCart } from '@/features/cart/cart-store';
import { getErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { useDocumentTitle } from '@/lib/use-document-title';
import type { MenuItem } from '@/types/database';

type Sort = 'recommended' | 'price-asc' | 'price-desc' | 'popular';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        'focus-visible:shadow-(--shadow-focus) focus-visible:outline-none',
        active ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface text-ink hover:border-ink/30',
      )}
    >
      {children}
    </button>
  );
}

function CartSummaryPanel() {
  const { lines, count, subtotalPaise } = useCart();
  return (
    <aside aria-label="Your order" className="sticky top-[calc(var(--spacing-header)+1.5rem)] hidden lg:block">
      <div className="rounded-lg border border-line bg-surface shadow-xs">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-semibold">Your order</h2>
          {count > 0 && <span className="text-sm text-ink-muted">{pluralize(count, 'item')}</span>}
        </div>
        {count === 0 ? (
          <div className="px-5 py-8 text-center">
            <ShoppingBag className="mx-auto size-6 text-ink-subtle" aria-hidden />
            <p className="mt-3 text-sm text-ink-muted">Your cart is empty. Add dishes to start an order.</p>
          </div>
        ) : (
          <>
            <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto px-5">
              {lines.map((l) => (
                <li key={l.itemId} className="flex items-center gap-3 py-3">
                  <FoodImage src={l.imageUrl} alt="" width={96} sizes="48px" className="size-11 shrink-0 rounded-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="tabular text-xs text-ink-muted">× {l.quantity}</p>
                  </div>
                  <Price paise={l.pricePaise * l.quantity} className="text-sm" />
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Subtotal</span>
                <Price paise={subtotalPaise} />
              </div>
              <Button asChild block size="lg" className="mt-4">
                <Link to="/cart">
                  Review order <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function MobileCartBar() {
  const { count, subtotalPaise } = useCart();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={reduce ? false : { y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduce ? undefined : { y: 24, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-3 pb-3 md:bottom-0 md:pb-5 lg:hidden"
        >
          <Link
            to="/cart"
            className="mx-auto flex h-14 max-w-xl items-center justify-between gap-3 rounded-lg bg-brand px-4 text-white shadow-lg transition-colors hover:bg-brand-hover focus-visible:shadow-(--shadow-focus) focus-visible:outline-none"
          >
            <span className="text-sm">
              <span className="font-semibold">{pluralize(count, 'item')}</span>
              <span className="tabular text-white/80"> · <Price paise={subtotalPaise} className="text-white" /></span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              View cart <ArrowRight className="size-4" aria-hidden />
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function MenuPage() {
  useDocumentTitle('Menu');
  const [params, setParams] = useSearchParams();
  const menu = useMenu();
  const popular = usePopularItems();
  const { data: settings } = useSettings();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const category = params.get('category') ?? 'all';
  const vegOnly = params.get('veg') === '1';
  const availableOnly = params.get('available') === '1';
  const sort = (params.get('sort') as Sort | null) ?? 'recommended';
  const openItemId = params.get('item');

  function update(patch: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === '') next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  const popularity = useMemo(
    () => new Map((popular.data ?? []).map((p) => [p.menu_item_id, p.units_sold])),
    [popular.data],
  );
  const hasPopularity = popularity.size > 0;

  const filtered = useMemo(() => {
    if (!menu.data) return [];
    const cat = menu.data.categories.find((c) => c.slug === category);
    let items = menu.data.items.filter((item) => {
      if (cat && item.category_id !== cat.id) return false;
      if (vegOnly && item.is_vegetarian !== true) return false;
      if (availableOnly && !stockLabel(item).available) return false;
      if (deferredQuery) {
        const hay = `${item.name} ${item.description}`.toLowerCase();
        if (!deferredQuery.split(/\s+/).every((word) => hay.includes(word))) return false;
      }
      return true;
    });
    if (sort === 'price-asc') items = [...items].sort((a, b) => a.price_paise - b.price_paise);
    if (sort === 'price-desc') items = [...items].sort((a, b) => b.price_paise - a.price_paise);
    if (sort === 'popular') items = [...items].sort((a, b) => (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0));
    return items;
  }, [menu.data, category, vegOnly, availableOnly, deferredQuery, sort, popularity]);

  const grouped = category === 'all' && !deferredQuery && sort === 'recommended';
  const sections = useMemo(() => {
    if (!menu.data || !grouped) return [];
    return menu.data.categories
      .map((c) => ({ category: c, items: filtered.filter((i) => i.category_id === c.id) }))
      .filter((s) => s.items.length > 0);
  }, [menu.data, filtered, grouped]);

  const openItem: MenuItem | null = (openItemId && menu.data?.byId.get(openItemId)) || null;
  const openCategory = openItem ? menu.data?.categories.find((c) => c.id === openItem.category_id) : undefined;
  const openState = settings ? getOpenState(settings) : null;
  const filtersActive = category !== 'all' || vegOnly || availableOnly || Boolean(deferredQuery);

  function clearFilters() {
    setQuery('');
    update({ category: null, veg: null, available: null, q: null, sort: null });
  }

  return (
    <div className="page-container pt-8 pb-12 sm:pt-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-display text-[40px] leading-none sm:text-[48px]">Menu</h1>
          <p className="mt-3 text-[15px] text-ink-muted">
            {menu.data ? `${pluralize(menu.data.items.length, 'dish', 'dishes')} · freshly prepared in the campus kitchen` : 'Fresh from the campus kitchen'}
          </p>
        </div>
      </header>

      {openState && !openState.isOpen && (
        <Notice tone="warning" className="mt-6" title={openState.label}>
          {openState.detail} You can still browse and build your cart.
        </Notice>
      )}

      {/* Filters */}
      <div className="z-20 -mx-4 mt-6 border-b border-line bg-canvas/95 px-4 pt-3 pb-3 backdrop-blur-md sm:-mx-6 sm:px-6 md:sticky md:top-(--spacing-header) lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative md:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <label htmlFor="menu-search" className="sr-only">
              Search the menu
            </label>
            <input
              id="menu-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              placeholder="Search dosa, chai, sandwich…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                update({ q: e.target.value || null });
              }}
              className="h-11 w-full rounded-full border border-line-strong bg-surface pr-10 pl-10 text-[15px] shadow-xs placeholder:text-ink-subtle hover:border-ink/25 focus:border-brand focus:shadow-(--shadow-focus) focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  update({ q: null });
                }}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 md:ml-auto md:flex-nowrap">
            <Chip active={vegOnly} onClick={() => update({ veg: vegOnly ? null : '1' })}>
              <span className="inline-flex size-3.5 items-center justify-center rounded-[2px] border-[1.5px] border-veg" aria-hidden>
                <span className="size-1.5 rounded-full bg-veg" />
              </span>
              Veg only
            </Chip>
            <Chip active={availableOnly} onClick={() => update({ available: availableOnly ? null : '1' })}>
              Available now
            </Chip>
            <div className="w-full sm:ml-auto sm:w-44 md:ml-0">
              <label htmlFor="menu-sort" className="sr-only">
                Sort dishes
              </label>
              <Select id="menu-sort" value={sort} onChange={(e) => update({ sort: e.target.value === 'recommended' ? null : e.target.value })} className="h-9 rounded-full text-sm">
                <option value="recommended">Recommended</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                {hasPopularity && <option value="popular">Most ordered</option>}
              </Select>
            </div>
          </div>
        </div>

        <div role="group" aria-label="Categories" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <Chip active={category === 'all'} onClick={() => update({ category: null })}>
            All
          </Chip>
          {menu.data?.categories.map((c) => (
            <Chip key={c.id} active={category === c.slug} onClick={() => update({ category: category === c.slug ? null : c.slug })}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div aria-live="polite" aria-busy={menu.isPending}>
          {menu.isPending ? (
            <div className="grid grid-cols-1 gap-4 min-[370px]:grid-cols-2 md:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <FoodCardSkeleton key={i} />
              ))}
            </div>
          ) : menu.isError ? (
            <ErrorState message={getErrorMessage(menu.error, 'We couldn’t load the menu.')} onRetry={() => menu.refetch()} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={deferredQuery ? `No dishes match “${query.trim()}”` : 'No dishes match these filters'}
              description="Try a different search or clear the filters to see the full menu."
              action={
                filtersActive && (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )
              }
            />
          ) : grouped ? (
            <div className="space-y-12">
              {sections.map(({ category: c, items }) => (
                <section key={c.id} aria-labelledby={`cat-${c.slug}`}>
                  <div className="mb-4 flex items-baseline justify-between gap-3">
                    <h2 id={`cat-${c.slug}`} className="text-xl font-semibold tracking-tight">
                      {c.name}
                    </h2>
                    {c.description && <p className="hidden text-sm text-ink-muted sm:block">{c.description}</p>}
                  </div>
                  <div className="grid grid-cols-1 gap-4 min-[370px]:grid-cols-2 md:grid-cols-3">
                    {items.map((item) => (
                      <FoodCard key={item.id} item={item} popularUnits={popularity.get(item.id)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-ink-muted">{pluralize(filtered.length, 'dish', 'dishes')}</p>
              <div className="grid grid-cols-1 gap-4 min-[370px]:grid-cols-2 md:grid-cols-3">
                {filtered.map((item) => (
                  <FoodCard key={item.id} item={item} popularUnits={popularity.get(item.id)} />
                ))}
              </div>
            </>
          )}
        </div>
        <CartSummaryPanel />
      </div>

      <MobileCartBar />
      <ItemDialog item={openItem} category={openCategory} onOpenChange={(open) => !open && update({ item: null })} />
    </div>
  );
}
