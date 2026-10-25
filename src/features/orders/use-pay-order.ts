import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/lib/errors';
import { cart } from '@/features/cart/cart-store';
import { menuKeys } from '@/features/menu/queries';
import { payForOrder } from './payment';
import { orderKeys } from './queries';
import { endCheckout } from './checkout-session';

export type PayState =
  | { kind: 'idle' }
  | { kind: 'paying' }
  | { kind: 'verifying' }
  | { kind: 'dismissed' }
  | { kind: 'failed'; message: string };

/** Runs the payment step for an unpaid order and handles every outcome. */
export function usePayOrder() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState<PayState>({ kind: 'idle' });

  async function pay(orderId: string, opts: { clearCart?: boolean } = {}) {
    setState({ kind: 'paying' });
    try {
      const outcome = await payForOrder(orderId, { onVerifying: () => setState({ kind: 'verifying' }) });
      if (outcome.status === 'paid') {
        if (opts.clearCart) {
          cart.clear();
          endCheckout();
        }
        void queryClient.invalidateQueries({ queryKey: orderKeys.all });
        void queryClient.invalidateQueries({ queryKey: menuKeys.menu });
        navigate(`/orders/${orderId}/confirmation`, { replace: true });
        return;
      }
      if (outcome.status === 'dismissed') {
        setState({ kind: 'dismissed' });
      } else {
        setState({ kind: 'failed', message: outcome.message });
      }
      void queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
    } catch (error) {
      setState({ kind: 'failed', message: getErrorMessage(error, 'We couldn’t start the payment. Please try again.') });
    }
  }

  return { state, setState, pay, busy: state.kind === 'paying' || state.kind === 'verifying' };
}
