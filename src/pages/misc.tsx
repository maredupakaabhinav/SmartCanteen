import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Compass, Database, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common';
import { Logo } from '@/components/brand/logo';
import { useDocumentTitle } from '@/lib/use-document-title';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="page-container py-16">
      <EmptyState
        icon={<Compass />}
        title="We couldn’t find that page"
        description="The link may be broken or the page may have moved."
        action={
          <>
            <Button asChild>
              <Link to="/menu">Browse the menu</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}

/** Top-level error boundary for unexpected render errors. */
export function RouteErrorPage() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (notFound) return <NotFoundPage />;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4">
      <Logo />
      <EmptyState
        icon={<TriangleAlert />}
        title="Something went wrong"
        description="An unexpected error occurred. Reloading usually fixes it — your cart is saved."
        action={<Button onClick={() => window.location.reload()}>Reload page</Button>}
      />
    </div>
  );
}

/** Shown when the deployment has no Supabase configuration yet. */
export function SetupRequiredPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-16">
      <Logo />
      <div className="mt-10 w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-warning-soft text-warning">
          <Database className="size-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-semibold">Connect a Supabase project</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          This deployment is missing its database configuration. Add these environment variables and redeploy:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md bg-ink p-4 text-[13px] leading-6 text-white">
          VITE_SUPABASE_URL=…{'\n'}VITE_SUPABASE_ANON_KEY=…
        </pre>
        <p className="mt-4 text-sm text-ink-muted">See the README for the full setup guide.</p>
      </div>
    </div>
  );
}
