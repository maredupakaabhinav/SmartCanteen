import { beforeEach, describe, expect, it } from 'vitest';
import { cart, cartTotals, MAX_QUANTITY } from '@/features/cart/cart-store';
import { cartSignature } from '@/features/orders/checkout-session';
import { getOpenState, describeOpenDays } from '@/features/menu/hours';
import { stockLabel } from '@/features/menu/queries';
import { formatPickupNumber, formatPrice } from '@/lib/format';
import { toCsv } from '@/lib/csv';
import { NEXT_STAFF_ACTION, PROGRESS_STEPS, progressIndex } from '@/features/orders/status';
import type { CanteenSettings, MenuItem } from '@/types/database';

const dosa = { itemId: 'dosa', name: 'Masala Dosa', pricePaise: 6000, imageUrl: null };
const chai = { itemId: 'chai', name: 'Masala Chai', pricePaise: 1500, imageUrl: null };

describe('cart store', () => {
  beforeEach(() => cart.clear());

  it('adds, merges and totals lines', () => {
    cart.add(dosa);
    cart.add(dosa, 2);
    cart.add(chai);
    expect(cart.getSnapshot()).toHaveLength(2);
    expect(cartTotals(cart.getSnapshot())).toEqual({ count: 4, subtotalPaise: 3 * 6000 + 1500 });
  });

  it('never allows zero, negative or excessive quantities', () => {
    cart.add(dosa);
    cart.setQuantity('dosa', 999);
    expect(cart.getSnapshot()[0]!.quantity).toBe(MAX_QUANTITY);
    cart.setQuantity('dosa', -4);
    expect(cart.getSnapshot()).toHaveLength(0);
    cart.add(chai, 0);
    expect(cart.getSnapshot()[0]!.quantity).toBe(1);
  });

  it('refreshes display prices from the live menu', () => {
    cart.add(dosa, 2);
    cart.refresh('dosa', { pricePaise: 6500 });
    expect(cartTotals(cart.getSnapshot()).subtotalPaise).toBe(13000);
  });

  it('builds an order-independent signature for idempotent checkout', () => {
    expect(cartSignature([{ itemId: 'a', quantity: 1 }, { itemId: 'b', quantity: 2 }])).toBe(
      cartSignature([{ itemId: 'b', quantity: 2 }, { itemId: 'a', quantity: 1 }]),
    );
    expect(cartSignature([{ itemId: 'a', quantity: 1 }])).not.toBe(cartSignature([{ itemId: 'a', quantity: 2 }]));
  });
});

describe('opening hours', () => {
  const settings = {
    timezone: 'Asia/Kolkata',
    opening_time: '08:00:00',
    closing_time: '20:00:00',
    open_days: [1, 2, 3, 4, 5, 6],
    accepting_orders: true,
  } as CanteenSettings;
  // 2026-10-14 is a Wednesday. 06:30 UTC = 12:00 IST.
  const wedNoon = new Date('2026-10-14T06:30:00Z');

  it('is open during hours on an open day', () => {
    expect(getOpenState(settings, wedNoon)).toMatchObject({ isOpen: true });
    expect(getOpenState(settings, wedNoon).label).toMatch(/Open now · until 8:00/i);
  });

  it('is closed before opening and after closing', () => {
    expect(getOpenState(settings, new Date('2026-10-14T01:00:00Z')).label).toMatch(/opens 8:00/i); // 06:30 IST
    expect(getOpenState(settings, new Date('2026-10-14T15:00:00Z')).label).toMatch(/opens tomorrow/i); // 20:30 IST
  });

  it('skips closed days and respects the pause switch', () => {
    // Saturday 21:00 IST → next open day is Monday
    expect(getOpenState(settings, new Date('2026-10-17T15:30:00Z')).label).toMatch(/opens Monday/i);
    expect(getOpenState({ ...settings, accepting_orders: false }, wedNoon)).toMatchObject({ isOpen: false, label: 'Not taking orders right now' });
  });

  it('describes open days', () => {
    expect(describeOpenDays([1, 2, 3, 4, 5, 6])).toBe('Monday – Saturday');
    expect(describeOpenDays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
  });
});

describe('availability labels', () => {
  const base = { is_available: true, stock_quantity: null } as MenuItem;
  it('distinguishes unavailable, sold out and low stock', () => {
    expect(stockLabel({ ...base, is_available: false })).toEqual({ available: false, label: 'Unavailable' });
    expect(stockLabel({ ...base, stock_quantity: 0 })).toEqual({ available: false, label: 'Sold out' });
    expect(stockLabel({ ...base, stock_quantity: 3 })).toEqual({ available: true, label: 'Only 3 left' });
    expect(stockLabel(base)).toEqual({ available: true, label: null });
  });
});

describe('formatting', () => {
  it('formats paise as rupees', () => {
    expect(formatPrice(6000)).toBe('₹60');
    expect(formatPrice(6050)).toBe('₹60.50');
    expect(formatPrice(1234500)).toBe('₹12,345');
  });
  it('pads pickup numbers', () => {
    expect(formatPickupNumber(7)).toBe('007');
    expect(formatPickupNumber(null)).toBe('—');
  });
});

describe('CSV export', () => {
  it('quotes values and neutralises spreadsheet formulas', () => {
    const csv = toCsv(['Item', 'Note'], [['Tea, hot', '=HYPERLINK("x")'], ['Say "hi"', 5]]);
    expect(csv).toBe('Item,Note\r\n"Tea, hot","\'=HYPERLINK(""x"")"\r\n"Say ""hi""",5');
  });
});

describe('order status model', () => {
  it('walks the happy path in order', () => {
    let status = 'placed' as keyof typeof NEXT_STAFF_ACTION;
    const seen = [status];
    while (NEXT_STAFF_ACTION[status]) {
      status = NEXT_STAFF_ACTION[status]!.to as typeof status;
      seen.push(status);
    }
    expect(seen).toEqual(PROGRESS_STEPS.map((s) => s.status));
    expect(progressIndex('ready')).toBe(3);
    expect(progressIndex('rejected')).toBe(-1);
  });
});
