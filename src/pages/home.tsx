import { useMemo } from 'react';
import { Link } from 'react-router';
import { ArrowRight, BellRing, ChevronDown, Clock, CreditCard, Megaphone, ShoppingBag, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FoodImage } from '@/components/common';
import { FoodCard, FoodCardSkeleton } from '@/features/menu/food-card';
import { stockLabel, useMenu, usePopularItems, useSettings } from '@/features/menu/queries';
import { describeOpenDays, getOpenState } from '@/features/menu/hours';
import { useActiveOrders } from '@/features/orders/queries';
import { ORDER_STATUS } from '@/features/orders/status';
import { formatClock, formatPickupNumber, pluralize } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/lib/use-document-title';

const HERO_IMAGES = {
  main: { src: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976', alt: 'Masala dosa served with sambar and chutneys' },
  top: { src: 'https://images.unsplash.com/photo-1619581073186-5b4ae1b0caad', alt: 'Masala chai in clay cups' },
  bottom: { src: 'https://images.unsplash.com/photo-1601050690597-df0568f70950', alt: 'Golden samosas with green chilli' },
};

function OpenStatus() {
  const { data: settings } = useSettings();
  if (!settings) return <span className="skeleton inline-block h-8 w-48 rounded-full" aria-hidden />;
  const state = getOpenState(settings);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium',
        state.isOpen ? 'border-brand/20 bg-brand-softer text-brand-ink' : 'border-line-strong bg-surface text-ink-muted',
      )}
    >
      <span className="relative flex size-2">
        {state.isOpen && <span className="absolute inset-0 animate-ping rounded-full bg-brand/60 motion-reduce:hidden" />}
        <span className={cn('relative size-2 rounded-full', state.isOpen ? 'bg-brand' : 'bg-ink-subtle')} />
      </span>
      {state.label}
    </span>
  );
}

function ActiveOrderBanner() {
  const { data } = useActiveOrders();
  const order = data?.[0];
  if (!order) return null;
  const meta = ORDER_STATUS[order.order_status];
  return (
    <div className="page-container pt-4">
      <Link
        to={`/orders/${order.id}`}
        className="group flex items-center gap-4 rounded-lg border border-brand/20 bg-brand-softer px-4 py-3 transition-colors hover:bg-brand-soft"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
          <BellRing className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-ink">
            Order #{formatPickupNumber(order.pickup_number)} · {meta.label}
          </span>
          <span className="block truncate text-[13px] text-brand-ink/80">{meta.description}</span>
        </span>
        <ArrowRight className="size-5 shrink-0 text-brand transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

function Hero() {
  const { data: active } = useActiveOrders();
  const trackHref = active?.[0] ? `/orders/${active[0].id}` : '/orders';
  return (
    <section className="page-container grid grid-cols-[minmax(0,1fr)] items-center gap-10 pt-8 pb-14 sm:pt-12 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:gap-10 lg:gap-16 lg:gap-16 lg:pt-16 lg:pb-20">
      <div>
        <OpenStatus />
        <h1 className="text-display mt-6 text-[44px] leading-[1.02] sm:text-[56px] md:text-[52px] lg:text-[68px]">
          Your campus cravings.
          <br />
          <span className="text-brand italic">One smart order.</span>
        </h1>
        <p className="mt-5 max-w-md text-[17px] leading-7 text-ink-muted">
          Order from the canteen on your phone, pay online and pick up with your order number — no waiting at the counter.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="sm:px-6">
            <Link to="/menu">
              Explore menu <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="sm:px-6">
            <Link to={trackHref}>Track an order</Link>
          </Button>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted">
          <li className="inline-flex items-center gap-2">
            <CreditCard className="size-4" aria-hidden /> UPI, cards &amp; netbanking
          </li>
          <li className="inline-flex items-center gap-2">
            <Ticket className="size-4" aria-hidden /> Pickup number on your phone
          </li>
        </ul>
      </div>

      <div className="relative grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 sm:gap-4" aria-hidden={false}>
        <FoodImage {...HERO_IMAGES.main} priority width={720} sizes="(min-width: 768px) 30vw, 58vw" className="row-span-2 aspect-[3/4] rounded-2xl shadow-md" />
        <FoodImage {...HERO_IMAGES.top} priority width={480} sizes="(min-width: 1024px) 280px, 40vw" className="aspect-square rounded-2xl shadow-sm" />
        <FoodImage {...HERO_IMAGES.bottom} width={480} sizes="(min-width: 1024px) 280px, 40vw" className="aspect-square rounded-2xl shadow-sm" />
      </div>
    </section>
  );
}

function Categories() {
  const { data, isPending } = useMenu();
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    data?.items.forEach((i) => map.set(i.category_id, (map.get(i.category_id) ?? 0) + 1));
    return map;
  }, [data]);

  return (
    <section aria-labelledby="categories-heading" className="page-container py-12">
      <div className="flex items-end justify-between gap-4">
        <h2 id="categories-heading" className="text-[22px] font-semibold tracking-tight">
          Browse by category
        </h2>
        <Link to="/menu" className="text-sm font-medium text-brand hover:underline">
          Full menu
        </Link>
      </div>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-5">
        {isPending
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="skeleton aspect-[5/4] rounded-lg" aria-hidden />
            ))
          : data?.categories.map((c, index) => (
              <li key={c.id} className={cn(index === 4 && 'col-span-2 sm:col-span-1')}>
                <Link
                  to={`/menu?category=${c.slug}`}
                  className="group relative block overflow-hidden rounded-lg focus-visible:shadow-(--shadow-focus) focus-visible:outline-none"
                >
                  <FoodImage src={c.image_url} alt="" width={400} sizes="(min-width: 1024px) 230px, 45vw" className={cn('aspect-[5/4] w-full transition-transform duration-500 group-hover:scale-[1.03]', index === 4 && 'max-sm:aspect-[5/2]')} />
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/15 to-transparent" aria-hidden />
                  <span className="absolute inset-x-0 bottom-0 p-3.5 text-white">
                    <span className="block text-[15px] font-semibold">{c.name}</span>
                    <span className="block text-xs text-white/80">{pluralize(counts.get(c.id) ?? 0, 'item')}</span>
                  </span>
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}

function Highlights() {
  const menu = useMenu();
  const popular = usePopularItems();

  const { title, caption, items, popularity } = useMemo(() => {
    const byId = menu.data?.byId;
    const real = (popular.data ?? [])
      .map((p) => ({ item: byId?.get(p.menu_item_id), units: p.units_sold }))
      .filter((p): p is { item: NonNullable<typeof p.item>; units: number } => Boolean(p.item))
      .slice(0, 4);
    if (real.length >= 4) {
      return {
        title: 'Popular this month',
        caption: 'Ranked by items sold in paid orders over the last 30 days.',
        items: real.map((r) => r.item),
        popularity: new Map(real.map((r) => [r.item.id, r.units])),
      };
    }
    const orderable = (menu.data?.items ?? []).filter((i) => stockLabel(i).available);
    const featured = orderable.filter((i) => i.is_featured).slice(0, 4);
    return {
      title: 'Today’s highlights',
      caption: 'Picked by the canteen team.',
      items: featured.length ? featured : orderable.slice(0, 4),
      popularity: new Map<string, number>(),
    };
  }, [menu.data, popular.data]);

  if (menu.isError) return null;

  return (
    <section aria-labelledby="highlights-heading" className="page-container py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="highlights-heading" className="text-[22px] font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{caption}</p>
        </div>
        <Link to="/menu" className="hidden shrink-0 text-sm font-medium text-brand hover:underline sm:inline">
          See all dishes
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 min-[370px]:grid-cols-2 md:grid-cols-4">
        {menu.isPending
          ? Array.from({ length: 4 }, (_, i) => <FoodCardSkeleton key={i} />)
          : items.map((item) => <FoodCard key={item.id} item={item} popularUnits={popularity.get(item.id)} />)}
      </div>
    </section>
  );
}

const STEPS = [
  { icon: ShoppingBag, title: 'Browse and add', body: 'Pick dishes from the live menu. Availability updates as the kitchen sells out.' },
  { icon: CreditCard, title: 'Order and pay', body: 'Check out in seconds with UPI, cards or netbanking through Razorpay.' },
  { icon: Ticket, title: 'Collect with your number', body: 'Watch your order move to “Ready”, then show your pickup number at the counter.' },
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="page-container py-12">
      <div className="rounded-2xl border border-line bg-surface px-5 py-10 sm:px-10 lg:px-14">
        <p className="eyebrow">How it works</p>
        <h2 id="how-heading" className="text-display mt-2 text-[34px] leading-tight sm:text-[40px]">
          Skip the queue in three steps
        </h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="tabular text-sm font-medium text-ink-subtle">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: 'Do I need an account to order?',
    a: 'You can browse the menu without signing in. We ask you to sign in at checkout so your orders and receipts stay private to you.',
  },
  {
    q: 'How do I collect my order?',
    a: 'After payment you get a pickup number. Keep the tracking page open — when the status changes to “Ready for pickup”, show the number at the counter.',
  },
  {
    q: 'What if payment fails or I close the payment window?',
    a: 'Your order is held as unpaid for 30 minutes and you can retry from the order page. If money was deducted, we check with Razorpay automatically before marking anything as unpaid.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'You can cancel an unpaid order yourself. Once paid, please speak to the canteen counter.',
  },
];

function InfoAndFaq() {
  const { data: settings } = useSettings();
  return (
    <section id="faq" aria-labelledby="faq-heading" className="page-container grid grid-cols-[minmax(0,1fr)] items-start gap-6 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="rounded-2xl bg-ink p-7 text-white sm:p-8">
        <Clock className="size-6 text-white/70" aria-hidden />
        <h2 className="mt-5 text-xl font-semibold text-white">Opening hours</h2>
        {settings ? (
          <>
            <p className="mt-2 text-white/75">{describeOpenDays(settings.open_days)}</p>
            <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
              {formatClock(settings.opening_time)} – {formatClock(settings.closing_time)}
            </p>
            <p className="mt-6 text-sm text-white/70">{getOpenState(settings).label}</p>
            {settings.location && <p className="mt-1 text-sm text-white/70">{settings.location}</p>}
          </>
        ) : (
          <div className="mt-4 h-16 rounded-md bg-white/10" aria-hidden />
        )}
      </div>
      <div>
        <h2 id="faq-heading" className="text-[22px] font-semibold tracking-tight">
          Questions, answered
        </h2>
        <div className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium">
                {q}
                <ChevronDown className="size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-5 text-sm leading-6 text-ink-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Announcement() {
  const { data: settings } = useSettings();
  if (!settings?.announcement) return null;
  return (
    <div className="page-container pt-4">
      <p className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-4 py-2.5 text-[13px] leading-5 text-ink-muted">
        <Megaphone className="mt-0.5 size-4 shrink-0 text-ink" aria-hidden />
        <span>{settings.announcement}</span>
      </p>
    </div>
  );
}

export default function HomePage() {
  useDocumentTitle(null);
  return (
    <>
      <Announcement />
      <ActiveOrderBanner />
      <Hero />
      <Categories />
      <Highlights />
      <HowItWorks />
      <InfoAndFaq />
    </>
  );
}
