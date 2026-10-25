import { createPaymentHandlers } from '../../server/payments.js';

const { simulate } = createPaymentHandlers();

export function POST(request: Request): Promise<Response> {
  return simulate(request);
}
