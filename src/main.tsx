import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/features/auth/auth-context';
import { SetupRequiredPage } from '@/pages/misc';
import { env } from '@/lib/env';
import { router } from './router';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) => {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return count < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {env.isSupabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MotionConfig reducedMotion="user">
            <RouterProvider router={router} />
          </MotionConfig>
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <SetupRequiredPage />
    )}
    <Toaster
      position="top-center"
      offset={72}
      mobileOffset={{ top: 72 }}
      toastOptions={{
        classNames: {
          toast: '!rounded-lg !border !border-line !bg-surface !text-ink !shadow-lg !font-sans',
          description: '!text-ink-muted',
          actionButton: '!bg-brand !text-white !rounded-sm !font-medium',
          success: '[&_[data-icon]]:!text-brand',
          error: '[&_[data-icon]]:!text-danger',
        },
      }}
    />
  </StrictMode>,
);
