import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, Lock, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { FoodImage, Notice, Price } from '@/components/common';
import { useAuth } from '@/features/auth/auth-context';
import { useValidatedCart } from '@/features/cart/use-validated-cart';
import { PriceBreakdown } from '@/features/cart/order-summary';
import { usePaymentConfig } from '@/features/orders/payment';
import { PaymentMethod } from '@/features/orders/payment-method';
import { usePayOrder } from '@/features/orders/use-pay-order';
import { beginCheckout, cartSignature, endCheckout, rememberOrder } from '@/features/orders/checkout-session';
import { cart } from '@/features/cart/cart-store';
import { orderKeys } from '@/features/orders/queries';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/errors';
import { formatPrice } from '@/lib/format';
import { useDocumentTitle } from '@/lib/use-document-title';
import type { Order } from '@/types/database';

export default function CheckoutPage() {
  useDocumentTitle('Checkout');
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const c = useValidatedCart();
  const payment = usePaymentConfig();
  const { state, setState, pay, busy } = usePayOrder();

  const [nameDraft, setName] = useState<string | null>(null);
  const name = nameDraft ?? profile?.display_name ?? '';
  const [note, setNote] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  if (c.lines.length === 0 && !order) return <Navigate to="/cart" replace />;

  const mode = payment.data?.mode;
  const closed = Boolean(c.openState && !c.openState.isOpen);
  const blocked = c.hasIssues || closed || mode === 'disabled' || payment.isError;
  const working = placing || busy;

  async function placeAndPay(event?: FormEvent) {
    event?.preventDefault();
    if (working) return;
    setPlaceError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setNameError('Enter the name the counter should call out (at least 2 characters).');
      document.getElementById('pickup-name')?.focus();
      return;
    }
    setNameError(null);
    setPlacing(true);
    try {
      const { idempotencyKey, staleOrderId } = beginCheckout(cartSignature(c.lines));
      if (staleOrderId) {
        // The cart changed since the last attempt: release the old unpaid order's stock.
        await supabase.rpc('cancel_unpaid_order', { p_order_id: staleOrderId });
      }
      const { data, error } = await supabase.rpc('place_order', {
        p_items: c.lines.map((l) => ({ menu_item_id: l.itemId, quantity: l.quantity })),
        p_idempotency_key: idempotencyKey,
        p_customer_name: trimmed,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const placed = data as Order;
      rememberOrder(placed.id);
      setOrder(placed);

      if (profile && !profile.display_name && user) {
        void supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id);
      }

      if (placed.order_status !== 'awaiting_payment') {
        // This exact checkout was already paid or closed (e.g. retried from another tab).
        cart.clear();
        endCheckout();
        navigate(`/orders/${placed.id}`, { replace: true });
        return;
      }
      setPlacing(false);
      await pay(placed.id, { clearCart: true });
    } catch (error) {
      setPlaceError(getErrorMessage(error, 'We couldn’t place your order. Please try again.'));
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
    } finally {
      setPlacing(false);
    }
  }

  async function cancelOrder() {
    if (!order) return;
    const { error } = await supabase.rpc('cancel_unpaid_order', { p_order_id: order.id });
    if (error) {
      toast.error(getErrorMessage(error));
      return;
    }
    toast.success('Order cancelled', { description: 'Your cart is still here if you want to try again.' });
    void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    setOrder(null);
    setState({ kind: 'idle' });
  }

  const ctaLabel = mode === 'demo' ? `Place order · simulate ${formatPrice(c.totalPaise)}` : `Pay ${formatPrice(c.totalPaise)}`;

  return (
    <div className="page-container pt-6 pb-16 sm:pt-10">
      <Link to="/cart" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to cart
      </Link>
      <h1 className="mt-4 text-[28px] leading-9 font-semibold tracking-[-0.02em] sm:text-[32px]">Checkout</h1>

      <form onSubmit={placeAndPay} noValidate className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_340px] md:items-start lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <section aria-labelledby="pickup-heading" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <h2 id="pickup-heading" className="text-base font-semibold">
              Pickup details
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              You’ll collect at the canteen counter with your pickup number. Signed in as {user?.email}.
            </p>
            <div className="mt-5 grid gap-5">
              <Field label="Name for the counter" error={nameError} hint="Shown to staff alongside your pickup number.">
                <Input
                  id="pickup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={60}
                  required
                  disabled={working || Boolean(order)}
                />
              </Field>
              <Field label="Note for the kitchen" optional hint="For example: less spicy, no onion.">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  rows={2}
                  disabled={working || Boolean(order)}
                />
              </Field>
            </div>
          </section>

          <section aria-labelledby="payment-heading" className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <h2 id="payment-heading" className="text-base font-semibold">
              Payment
            </h2>
            <div className="mt-4">
              {payment.isError ? (
                <Notice tone="danger" icon={<CircleAlert />} title="We couldn’t reach the payment service">
                  Check your connection and{' '}
                  <button type="button" className="font-semibold underline" onClick={() => payment.refetch()}>
                    try again
                  </button>
                  .
                </Notice>
              ) : (
                <PaymentMethod mode={mode} loading={payment.isPending} />
              )}
            </div>
          </section>
        </div>

        <aside aria-label="Order summary" className="md:sticky md:top-[calc(var(--spacing-header)+1.5rem)]">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-xs sm:p-6">
            <h2 className="text-base font-semibold">Your order</h2>
            <ul className="mt-4 divide-y divide-line">
              {c.lines.map((l) => (
                <li key={l.itemId} className="flex items-center gap-3 py-3">
                  <FoodImage src={l.imageUrl} alt="" width={96} sizes="44px" className="size-11 shrink-0 rounded-sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    <p className="tabular text-xs text-ink-muted">
                      {l.quantity} × {formatPrice(l.item?.price_paise ?? l.pricePaise)}
                    </p>
                    {l.issueText && <p className="text-xs font-medium text-danger">{l.issueText}</p>}
                  </div>
                  <Price paise={(l.item?.price_paise ?? l.pricePaise) * l.quantity} className="text-sm" />
                </li>
              ))}
            </ul>
            <PriceBreakdown
              className="mt-3 border-t border-line pt-4"
              subtotalPaise={order?.subtotal_paise ?? c.subtotalPaise}
              chargesPaise={order?.charges_paise ?? c.chargesPaise}
              totalPaise={order?.total_paise ?? c.totalPaise}
              totalLabel="To pay"
            />

            <div className="mt-5 space-y-3" aria-live="polite">
              {placeError && (
                <Notice tone="danger" icon={<CircleAlert />} title="Order not placed">
                  {placeError}
                </Notice>
              )}
              {c.hasIssues && (
                <Notice tone="danger" icon={<CircleAlert />}>
                  Some items are no longer available. <Link className="font-semibold underline" to="/cart">Update your cart</Link>.
                </Notice>
              )}
              {closed && c.openState && <Notice tone="warning" title={c.openState.label}>{c.openState.detail}</Notice>}
              {state.kind === 'dismissed' && order && (
                <Notice tone="warning" title="Payment not completed">
                  Order {order.order_number} is held for 30 minutes. Pay now to send it to the kitchen, or cancel it.
                </Notice>
              )}
              {state.kind === 'failed' && (
                <Notice tone="danger" icon={<CircleAlert />} title="Payment didn’t go through">
                  {state.message} No order is sent to the kitchen until payment is verified.
                </Notice>
              )}
              {state.kind === 'verifying' && (
                <Notice tone="info">Verifying your payment with the bank… please keep this page open.</Notice>
              )}
            </div>

            {order && (state.kind === 'dismissed' || state.kind === 'failed') ? (
              <div className="mt-5 grid gap-2">
                <Button size="lg" block onClick={() => pay(order.id, { clearCart: true })} loading={busy}>
                  <RotateCw aria-hidden /> Try payment again
                </Button>
                <Button variant="ghost" block onClick={cancelOrder} disabled={busy}>
                  Cancel this order
                </Button>
              </div>
            ) : (
              <Button
                type="submit"
                size="lg"
                block
                className="mt-5"
                loading={working}
                loadingText={state.kind === 'verifying' ? 'Verifying payment…' : placing ? 'Placing order…' : 'Waiting for payment…'}
                disabled={blocked || c.loading || payment.isPending}
              >
                <Lock aria-hidden /> {ctaLabel}
              </Button>
            )}
            <p className="mt-3 text-center text-xs leading-5 text-ink-muted">
              Prices and availability are confirmed by the canteen when you place the order.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
