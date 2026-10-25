import { createPaymentHandlers } from '../../server/payments.js';

const { create } = createPaymentHandlers();

export function POST(request: Request): Promise<Response> {
  return create(request);
}
