import { createPaymentHandlers } from '../../server/payments.js';

const { verify } = createPaymentHandlers();

export function POST(request: Request): Promise<Response> {
  return verify(request);
}
