import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './auth-context';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

function FullPageSpinner() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center text-ink-muted">
      <Spinner label="Loading" className="[&_svg]:size-6" />
    </div>
  );
}

/** Requires a signed-in user; otherwise sends them to sign in and back. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <FullPageSpinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }
  return children;
}

/**
 * Hides staff screens from everyone else. This is a UX guard only — every
 * admin query and mutation is also enforced by RLS / SQL role checks.
 */
export function RequireStaff({ children }: { children: ReactNode }) {
  const { user, initializing, profileLoading, isStaff } = useAuth();
  const location = useLocation();
  if (initializing || profileLoading) return <FullPageSpinner />;
  if (!user) {
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (!isStaff) {
    return (
      <div className="page-container py-16">
        <EmptyState
          icon={<ShieldAlert />}
          title="Staff access only"
          description="This area is for canteen staff. If you work at the canteen, ask an administrator to grant your account access."
          action={
            <Button asChild variant="outline">
              <Link to="/">Back to Smart Canteen</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return children;
}
