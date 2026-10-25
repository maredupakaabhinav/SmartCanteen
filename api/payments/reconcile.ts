import { createPaymentHandlers } from '../../server/payments.js';

const { reconcile } = createPaymentHandlers();

export function POST(request: Request): Promise<Response> {
  return reconcile(request);
}
