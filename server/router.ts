import { createPaymentHandlers } from './payments.js';
import { json } from './http.js';

type Handler = (request: Request) => Promise<Response>;

let handlers: ReturnType<typeof createPaymentHandlers> | null = null;

/** Path → handler map. Used by the Vite dev server; Vercel uses the files in /api. */
export function resolveApiRoute(pathname: string): Handler {
  handlers ??= createPaymentHandlers();
  const routes: Record<string, Handler> = {
    '/api/payments/config': handlers.config,
    '/api/payments/create': handlers.create,
    '/api/payments/verify': handlers.verify,
    '/api/payments/reconcile': handlers.reconcile,
    '/api/payments/simulate': handlers.simulate,
    '/api/payments/webhook': handlers.webhook,
    '/api/health': async () => json({ ok: true }),
  };
  return routes[pathname] ?? (async () => json({ error: 'Not found.' }, 404));
}
