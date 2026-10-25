import { Suspense, useEffect, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import { SiteHeader } from './site-header';
import { MobileNav } from './mobile-nav';
import { SiteFooter } from './site-footer';
import { useMenuRealtime } from '@/features/menu/queries';
import { PageFallback } from './page-fallback';

export function SiteLayout() {
  const location = useLocation();
  const reduce = useReducedMotion();
  // Fade between pages, but never delay the very first paint.
  const [firstPath] = useState(location.pathname);
  const animate = !reduce && location.pathname !== firstPath;
  useMenuRealtime();

  // Move focus to the page on navigation so screen readers announce the new page.
  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 pb-24 outline-none md:pb-0">
        <motion.div
          key={location.pathname}
          // Opacity only: a transform here would break position:fixed bars inside pages.
          initial={animate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </motion.div>
      </main>
      <SiteFooter />
      <MobileNav />
      <ScrollRestoration />
    </div>
  );
}
