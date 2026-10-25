import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChefHat, ClipboardList, LayoutDashboard, LogOut, ShoppingBag, UserRound } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/misc';
import { useCart } from '@/features/cart/cart-store';
import { useAuth, firstName } from '@/features/auth/auth-context';
import { useActiveOrders } from '@/features/orders/queries';
import { cn } from '@/lib/cn';
import { formatPickupNumber } from '@/lib/format';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/menu', label: 'Menu', end: false },
  { to: '/orders', label: 'My orders', end: false },
];

export function CartCount({ count, className }: { count: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.span
          key={count}
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 26 }}
          className={cn(
            'tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] leading-none font-semibold text-white',
            className,
          )}
        >
          {count > 99 ? '99+' : count}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function AccountMenu() {
  const { user, profile, isStaff, signOut } = useAuth();
  const navigate = useNavigate();
  if (!user) {
    return (
      <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
        <Link to="/sign-in">Sign in</Link>
      </Button>
    );
  }
  const name = firstName(profile, user);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="hidden h-9 items-center gap-2 rounded-full border border-line-strong bg-surface pr-3 pl-1 text-sm font-medium shadow-xs transition-colors hover:bg-surface-muted focus-visible:shadow-(--shadow-focus) focus-visible:outline-none md:inline-flex"
          aria-label="Account menu"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-ink uppercase">
            {name.slice(0, 1) || <UserRound className="size-4" />}
          </span>
          <span className="max-w-28 truncate">{name || 'Account'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          Signed in as
          <span className="block truncate text-sm font-medium text-ink">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/orders')}>
          <ClipboardList aria-hidden /> My orders
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/account')}>
          <UserRound aria-hidden /> Profile
        </DropdownMenuItem>
        {isStaff && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/admin')}>
              <LayoutDashboard aria-hidden /> Staff dashboard
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            navigate('/');
          }}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActiveOrderPill() {
  const { data } = useActiveOrders();
  const order = data?.[0];
  if (!order) return null;
  const ready = order.order_status === 'ready';
  return (
    <Link
      to={`/orders/${order.id}`}
      className={cn(
        'hidden items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors lg:inline-flex',
        ready ? 'border-brand/20 bg-brand-soft text-brand-ink hover:bg-[#d8e8dd]' : 'border-line-strong bg-surface hover:bg-surface-muted',
      )}
    >
      <span className={cn('size-2 rounded-full', ready ? 'bg-brand' : 'animate-pulse bg-warning-strong')} aria-hidden />
      {ready ? 'Ready' : 'Order'} #{formatPickupNumber(order.pickup_number)}
    </Link>
  );
}

export function SiteHeader() {
  const { count } = useCart();
  const { isStaff } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'no-print sticky top-0 z-40 border-b transition-[border-color,background-color] duration-200',
        scrolled ? 'border-line bg-canvas/85 backdrop-blur-md' : 'border-transparent bg-canvas',
      )}
    >
      <div className="page-container flex h-(--spacing-header) items-center gap-4">
        <Link to="/" className="rounded-md focus-visible:shadow-(--shadow-focus) focus-visible:outline-none" aria-label="Smart Canteen home">
          <Logo compact />
        </Link>

        <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {item.label}
                  {isActive && <span className="absolute -bottom-[9px] left-0 h-0.5 w-full rounded-full bg-brand" aria-hidden />}
                </span>
              )}
            </NavLink>
          ))}
          {isStaff && (
            <NavLink
              to="/admin"
              className="ml-1 inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <ChefHat className="size-4" aria-hidden /> Staff
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ActiveOrderPill />
          <Button asChild variant="ghost" size="sm" className="relative gap-2 px-2.5">
            <Link to="/cart" aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}>
              <ShoppingBag className="size-5" aria-hidden />
              <span className="hidden text-sm sm:inline">Cart</span>
              <CartCount count={count} />
            </Link>
          </Button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
