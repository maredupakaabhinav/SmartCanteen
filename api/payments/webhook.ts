import { createPaymentHandlers } from '../../server/payments.js';

const { webhook } = createPaymentHandlers();

export function POST(request: Request): Promise<Response> {
  return webhook(request);
}
