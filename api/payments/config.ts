import { createPaymentHandlers } from '../../server/payments.js';

const { config } = createPaymentHandlers();

export function GET(request: Request): Promise<Response> {
  return config(request);
}
