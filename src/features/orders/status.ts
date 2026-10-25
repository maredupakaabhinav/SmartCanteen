import type { OrderStatus, PaymentStatus } from '@/types/database';

type Tone = 'neutral' | 'brand' | 'warning' | 'danger' | 'info' | 'solid';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone; description: string }> = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'warning', description: 'Complete payment to send your order to the kitchen.' },
  placed: { label: 'Order placed', tone: 'info', description: 'Your order has been received and is waiting for the kitchen to accept it.' },
  accepted: { label: 'Accepted', tone: 'info', description: 'The kitchen has accepted your order.' },
  preparing: { label: 'Preparing', tone: 'warning', description: 'Your food is being prepared.' },
  ready: { label: 'Ready for pickup', tone: 'brand', description: 'Your order is ready. Show your pickup number at the counter.' },
  completed: { label: 'Completed', tone: 'neutral', description: 'Collected. Enjoy your meal!' },
  rejected: { label: 'Rejected', tone: 'danger', description: 'The canteen could not fulfil this order.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', description: 'This order was cancelled before payment.' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Payment pending', tone: 'warning' },
  paid: { label: 'Paid', tone: 'brand' },
  failed: { label: 'Payment failed', tone: 'danger' },
  cancelled: { label: 'Not paid', tone: 'neutral' },
  simulated: { label: 'Demo payment', tone: 'info' },
};

/** The happy-path progress shown to students. */
export const PROGRESS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'placed', label: 'Order placed' },
  { status: 'accepted', label: 'Accepted' },
  { status: 'preparing', label: 'Preparing' },
  { status: 'ready', label: 'Ready for pickup' },
  { status: 'completed', label: 'Completed' },
];

export function progressIndex(status: OrderStatus): number {
  return PROGRESS_STEPS.findIndex((s) => s.status === status);
}

export const ACTIVE_STATUSES: OrderStatus[] = ['awaiting_payment', 'placed', 'accepted', 'preparing', 'ready'];
export const isActiveOrder = (s: OrderStatus) => ACTIVE_STATUSES.includes(s);

/** Next step a staff member can take from each status (mirrors is_valid_order_transition in SQL). */
export const NEXT_STAFF_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  placed: { to: 'accepted', label: 'Accept order' },
  accepted: { to: 'preparing', label: 'Start preparing' },
  preparing: { to: 'ready', label: 'Mark ready' },
  ready: { to: 'completed', label: 'Mark collected' },
};

export const REJECTABLE: OrderStatus[] = ['placed', 'accepted'];

export function timestampFor(
  status: OrderStatus,
  order: {
    placed_at: string | null;
    accepted_at: string | null;
    preparing_at: string | null;
    ready_at: string | null;
    completed_at: string | null;
  },
): string | null {
  switch (status) {
    case 'placed':
      return order.placed_at;
    case 'accepted':
      return order.accepted_at;
    case 'preparing':
      return order.preparing_at;
    case 'ready':
      return order.ready_at;
    case 'completed':
      return order.completed_at;
    default:
      return null;
  }
}
