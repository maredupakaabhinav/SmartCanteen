import { NavLink } from 'react-router';
import { ClipboardList, House, ShoppingBag, UserRound, UtensilsCrossed } from 'lucide-react';
import { useCart } from '@/features/cart/cart-store';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';
import { CartCount } from './site-header';

/** Thumb-reachable bottom navigation for phones. */
export function MobileNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const items = [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
    { to: '/cart', label: 'Cart', icon: ShoppingBag, badge: count },
    { to: '/orders', label: 'Orders', icon: ClipboardList },
    user ? { to: '/account', label: 'Account', icon: UserRound } : { to: '/sign-in', label: 'Sign in', icon: UserRound },
  ];

  return (
    <nav
      aria-label="Primary"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md md:hidden safe-bottom"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ to, label, icon: Icon, end, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  isActive ? 'text-brand' : 'text-ink-muted active:text-ink',
                )
              }
            >
              <span className="relative">
                <Icon className="size-[22px]" aria-hidden strokeWidth={1.8} />
                {badge ? <CartCount count={badge} className="absolute -top-2 -right-3 h-[18px] min-w-[18px] px-1 text-[10px]" /> : null}
              </span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
