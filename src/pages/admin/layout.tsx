import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { BarChart3, ClipboardList, ExternalLink, LayoutDashboard, LogOut, Menu, Settings, UtensilsCrossed } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Dialog, DialogTrigger, SheetContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { PageFallback } from '@/components/layout/page-fallback';
import { useAuth } from '@/features/auth/auth-context';
import { useAdminOverview, useAdminRealtime } from '@/features/admin/queries';
import { cn } from '@/lib/cn';

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList, badge: true },
  { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useAdminOverview();
  const newCount = data?.new_orders ?? 0;
  return (
    <nav aria-label="Staff" className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
              isActive ? 'bg-surface text-ink shadow-xs ring-1 ring-line' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
            )
          }
        >
          <Icon className="size-[18px]" aria-hidden />
          <span className="flex-1">{label}</span>
          {badge && newCount > 0 && (
            <span className="tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white" aria-label={`${newCount} new orders`}>
              {newCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="space-y-1 border-t border-line pt-4">
      <Link to="/" className="flex h-10 items-center gap-3 rounded-md px-3 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink">
        <ExternalLink className="size-[18px]" aria-hidden /> Student site
      </Link>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          navigate('/');
        }}
        className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink"
      >
        <LogOut className="size-[18px]" aria-hidden /> Sign out
      </button>
      <div className="px-3 pt-3">
        <p className="truncate text-sm font-medium">{profile?.display_name || user?.email}</p>
        <p className="text-xs text-ink-muted capitalize">{profile?.role}</p>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const live = useAdminRealtime();
  const location = useLocation();
  // Only warn if the realtime connection stays down (avoid flashing during the initial connect).
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (live) return;
    const t = setTimeout(() => setTimedOut(true), 6000);
    return () => {
      clearTimeout(t);
      setTimedOut(false);
    };
  }, [live]);
  const showOffline = !live && timedOut;

  return (
    <div className="min-h-dvh bg-[#F6F5F0] lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-[#F1F0EA] px-4 py-5 lg:flex">
        <Link to="/admin" className="flex items-center gap-2 px-2">
          <Logo />
        </Link>
        <Badge tone="outline" className="mx-2 w-fit">
          Staff dashboard
        </Badge>
        <div className="flex-1">
          <SidebarNav />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-[#F1F0EA]/95 px-4 backdrop-blur lg:hidden">
        <Link to="/admin" aria-label="Staff dashboard home">
          <Logo compact />
        </Link>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button className="flex size-10 items-center justify-center rounded-md hover:bg-surface-muted" aria-label="Open navigation">
              <Menu className="size-5" aria-hidden />
            </button>
          </DialogTrigger>
          <SheetContent title="Staff navigation" className="gap-6 bg-[#F1F0EA] px-4 py-5">
            <Logo />
            <div className="flex-1">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </div>
            <SidebarFooter />
          </SheetContent>
        </Dialog>
      </header>

      <main className="min-w-0">
        {showOffline && (
          <p className="border-b border-warning-strong/20 bg-warning-soft px-4 py-1.5 text-center text-xs text-warning" role="status">
            Live updates are reconnecting — the queue refreshes automatically every 20 seconds.
          </p>
        )}
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense key={location.pathname} fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
