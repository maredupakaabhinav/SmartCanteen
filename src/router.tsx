import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Outlet, useNavigate } from 'react-router';
import { SiteLayout } from '@/components/layout/site-layout';
import { PageFallback } from '@/components/layout/page-fallback';
import { RequireAuth, RequireStaff } from '@/features/auth/guards';
import { registerNavigate } from '@/lib/navigation';
import HomePage from '@/pages/home';
import { NotFoundPage, RouteErrorPage } from '@/pages/misc';

// Route-level code splitting: the home page ships in the main bundle, the rest load on demand.
const MenuPage = lazy(() => import('@/pages/menu'));
const CartPage = lazy(() => import('@/pages/cart'));
const CheckoutPage = lazy(() => import('@/pages/checkout'));
const OrdersPage = lazy(() => import('@/pages/orders'));
const OrderTrackingPage = lazy(() => import('@/pages/order-tracking'));
const OrderConfirmationPage = lazy(() => import('@/pages/order-confirmation'));
const AccountPage = lazy(() => import('@/pages/account'));
const SignInPage = lazy(() => import('@/pages/auth').then((m) => ({ default: m.SignInPage })));
const SignUpPage = lazy(() => import('@/pages/auth').then((m) => ({ default: m.SignUpPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/auth').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/pages/auth').then((m) => ({ default: m.ResetPasswordPage })));

const AdminLayout = lazy(() => import('@/pages/admin/layout'));
const AdminOverviewPage = lazy(() => import('@/pages/admin/overview'));
const AdminOrdersPage = lazy(() => import('@/pages/admin/orders'));
const AdminMenuPage = lazy(() => import('@/pages/admin/menu'));
const AdminReportsPage = lazy(() => import('@/pages/admin/reports'));
const AdminSettingsPage = lazy(() => import('@/pages/admin/settings'));

function Root() {
  const navigate = useNavigate();
  useEffect(() => {
    registerNavigate(navigate);
    return () => registerNavigate(null);
  }, [navigate]);
  return <Outlet />;
}

const auth = (node: ReactNode) => <RequireAuth>{node}</RequireAuth>;

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <SiteLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'menu', element: <MenuPage /> },
          { path: 'cart', element: <CartPage /> },
          { path: 'checkout', element: auth(<CheckoutPage />) },
          { path: 'orders', element: auth(<OrdersPage />) },
          { path: 'orders/:orderId', element: auth(<OrderTrackingPage />) },
          { path: 'orders/:orderId/confirmation', element: auth(<OrderConfirmationPage />) },
          { path: 'account', element: auth(<AccountPage />) },
          { path: 'sign-in', element: <SignInPage /> },
          { path: 'sign-up', element: <SignUpPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        path: 'admin',
        element: (
          <Suspense fallback={<PageFallback />}>
            <RequireStaff>
              <AdminLayout />
            </RequireStaff>
          </Suspense>
        ),
        children: [
          { index: true, element: <AdminOverviewPage /> },
          { path: 'orders', element: <AdminOrdersPage /> },
          { path: 'menu', element: <AdminMenuPage /> },
          { path: 'reports', element: <AdminReportsPage /> },
          { path: 'settings', element: <AdminSettingsPage /> },
        ],
      },
    ],
  },
]);
