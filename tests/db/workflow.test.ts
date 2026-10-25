import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { NEXT_STAFF_ACTION, REJECTABLE } from '../../src/features/orders/status';
import {
  ITEMS,
  anon,
  as,
  createTestDb,
  createUser,
  payOrder,
  placeOrder,
  service,
  stockOf,
  student,
  type Db,
  type OrderRow,
} from './harness';

let db: Db;
let alice: string;
let bob: string;
let staff: string;
let admin: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { email: 'alice@example.edu', name: 'Alice' });
  bob = await createUser(db, { email: 'bob@example.edu', name: 'Bob' });
  staff = await createUser(db, { email: 'staff@example.edu', name: 'Counter Staff', role: 'staff' });
  admin = await createUser(db, { email: 'admin@example.edu', name: 'Admin', role: 'admin' });
}, 60_000);

const updateStatus = (uid: string, order: OrderRow, expected: string, next: string, note: string | null = null) =>
  as(db, student(uid), async (tx) => {
    const r = await tx.query<OrderRow>(`select * from public.update_order_status($1, $2, $3, $4)`, [
      order.id,
      expected,
      next,
      note,
    ]);
    return r.rows[0]!;
  });

describe('migrations & seed', () => {
  it('creates a profile for every new auth user', async () => {
    const r = await db.query<{ display_name: string; role: string }>(
      `select display_name, role from public.profiles where id = $1`,
      [alice],
    );
    expect(r.rows[0]).toEqual({ display_name: 'Alice', role: 'student' });
  });

  it('lets anonymous visitors read the menu but hides archived items', async () => {
    await db.query(`update public.menu_items set is_archived = true where id = $1`, [ITEMS.brownie]);
    const rows = await as(db, anon, async (tx) => (await tx.query(`select id from public.menu_items`)).rows);
    expect(rows).toHaveLength(24);
    await db.query(`update public.menu_items set is_archived = false where id = $1`, [ITEMS.brownie]);
  });
});

describe('placing orders', () => {
  it('computes totals from database prices and ignores client-supplied prices', async () => {
    const order = await placeOrder(db, alice, [
      { menu_item_id: ITEMS.masalaDosa, quantity: 2, price_paise: 1 },
      { menu_item_id: ITEMS.chai, quantity: 1, unit_price_paise: 1 },
    ]);
    expect(order.subtotal_paise).toBe(2 * 6000 + 1500);
    expect(order.total_paise).toBe(order.subtotal_paise + order.charges_paise);
    expect(order.order_status).toBe('awaiting_payment');
    expect(order.payment_status).toBe('pending');
    expect(order.order_number).toMatch(/^SC-\d{6}-\d{4}$/);

    const items = await as(db, student(alice), async (tx) =>
      (await tx.query<{ unit_price_paise: number; line_total_paise: number }>(
        `select unit_price_paise, line_total_paise from public.order_items where order_id = $1 order by unit_price_paise desc`,
        [order.id],
      )).rows,
    );
    expect(items).toEqual([
      { unit_price_paise: 6000, line_total_paise: 12000 },
      { unit_price_paise: 1500, line_total_paise: 1500 },
    ]);
  });

  it('merges duplicate lines and adds the transparent service fee', async () => {
    await db.query(`update public.canteen_settings set service_fee_paise = 500`);
    const order = await placeOrder(db, bob, [
      { menu_item_id: ITEMS.chai, quantity: 1 },
      { menu_item_id: ITEMS.chai, quantity: 2 },
    ]);
    expect(order.subtotal_paise).toBe(4500);
    expect(order.charges_paise).toBe(500);
    expect(order.total_paise).toBe(5000);
    await db.query(`update public.canteen_settings set service_fee_paise = 0`);
    await as(db, student(bob), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [order.id]));
  });

  it('is idempotent for repeated submissions with the same key', async () => {
    const key = randomUUID();
    const first = await placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 1 }], key);
    const second = await placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 1 }], key);
    expect(second.id).toBe(first.id);
    const count = await db.query<{ n: number }>(`select count(*)::int as n from public.orders where idempotency_key = $1`, [key]);
    expect(count.rows[0]!.n).toBe(1);
    await as(db, student(bob), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [first.id]));
  });

  it('reserves tracked stock and refuses to oversell', async () => {
    expect(await stockOf(db, ITEMS.samosa)).toBe(40);
    const order = await placeOrder(db, alice, [{ menu_item_id: ITEMS.samosa, quantity: 20 }]);
    expect(await stockOf(db, ITEMS.samosa)).toBe(20);

    await db.query(`update public.menu_items set stock_quantity = 3 where id = $1`, [ITEMS.samosa]);
    await expect(placeOrder(db, bob, [{ menu_item_id: ITEMS.samosa, quantity: 4 }])).rejects.toThrow(/Only 3/);
    await db.query(`update public.menu_items set stock_quantity = 0 where id = $1`, [ITEMS.samosa]);
    await expect(placeOrder(db, bob, [{ menu_item_id: ITEMS.samosa, quantity: 1 }])).rejects.toThrow(/sold out/);

    // Cancelling the unpaid order returns its reserved stock.
    await as(db, student(alice), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [order.id]));
    expect(await stockOf(db, ITEMS.samosa)).toBe(20);
    await db.query(`update public.menu_items set stock_quantity = 40 where id = $1`, [ITEMS.samosa]);
  });

  it('rejects unavailable items, archived items, bad quantities and empty carts', async () => {
    await expect(placeOrder(db, bob, [{ menu_item_id: ITEMS.paneerTikka, quantity: 1 }])).rejects.toThrow(/unavailable/);
    await expect(placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 21 }])).rejects.toThrow(/between 1 and 20/);
    await expect(placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 0 }])).rejects.toThrow(/between 1 and 20/);
    await expect(placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: -3 }])).rejects.toThrow(/between 1 and 20/);
    await expect(placeOrder(db, bob, [])).rejects.toThrow(/empty/);
    await expect(placeOrder(db, bob, [{ menu_item_id: randomUUID(), quantity: 1 }])).rejects.toThrow(/no longer on the menu/);
    await db.query(`update public.menu_items set is_archived = true where id = $1`, [ITEMS.brownie]);
    await expect(placeOrder(db, bob, [{ menu_item_id: ITEMS.brownie, quantity: 1 }])).rejects.toThrow(/no longer on the menu/);
    await db.query(`update public.menu_items set is_archived = false where id = $1`, [ITEMS.brownie]);
  });

  it('refuses orders while the canteen is closed', async () => {
    await db.query(`update public.canteen_settings set accepting_orders = false`);
    await expect(placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 1 }])).rejects.toThrow(/not accepting orders/);
    await db.query(`update public.canteen_settings set accepting_orders = true`);
  });

  it('requires sign-in', async () => {
    await expect(
      as(db, anon, (tx) => tx.query(`select public.place_order('[]'::jsonb, gen_random_uuid())`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('expires unpaid orders after the payment window and releases stock', async () => {
    const before = (await stockOf(db, ITEMS.brownie))!;
    const order = await placeOrder(db, bob, [{ menu_item_id: ITEMS.brownie, quantity: 2 }]);
    expect(await stockOf(db, ITEMS.brownie)).toBe(before - 2);
    await db.query(`update public.orders set created_at = now() - interval '31 minutes' where id = $1`, [order.id]);
    await as(db, student(bob), (tx) => tx.query(`select public.expire_stale_orders()`));
    const r = await db.query<OrderRow>(`select * from public.orders where id = $1`, [order.id]);
    expect(r.rows[0]!.order_status).toBe('cancelled');
    expect(await stockOf(db, ITEMS.brownie)).toBe(before);
  });
});

describe('payments', () => {
  it('only the service role can confirm or simulate payments', async () => {
    const order = await placeOrder(db, alice, [{ menu_item_id: ITEMS.chai, quantity: 1 }]);
    await expect(
      as(db, student(alice), (tx) => tx.query(`select public.confirm_payment($1, 'x', 'y', $2)`, [order.id, order.total_paise])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, student(alice), (tx) => tx.query(`select public.simulate_payment($1)`, [order.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, student(alice), (tx) => tx.query(`update public.orders set payment_status = 'paid' where id = $1`, [order.id])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, student(alice), (tx) =>
        tx.query(`insert into public.payments (order_id, provider, amount_paise, status) values ($1, 'razorpay', 1, 'paid')`, [order.id]),
      ),
    ).rejects.toThrow(/permission denied/);
    await as(db, student(alice), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [order.id]));
  });

  it('confirms a verified payment once, assigns a pickup number and is idempotent', async () => {
    const order = await placeOrder(db, alice, [{ menu_item_id: ITEMS.masalaDosa, quantity: 1 }]);
    const { order: paid, providerOrderId, paymentId } = await payOrder(db, order);
    expect(paid.payment_status).toBe('paid');
    expect(paid.order_status).toBe('placed');
    expect(paid.pickup_number).toBeGreaterThan(0);

    const again = await as(db, service, async (tx) =>
      (await tx.query<OrderRow>(`select * from public.confirm_payment($1, $2, $3, $4)`, [order.id, providerOrderId, paymentId, order.total_paise])).rows[0]!,
    );
    expect(again.pickup_number).toBe(paid.pickup_number);

    await expect(
      as(db, service, (tx) => tx.query(`select public.confirm_payment($1, $2, 'pay_other', $3)`, [order.id, providerOrderId, order.total_paise])),
    ).rejects.toThrow(/different payment/);
  });

  it('rejects a payment whose amount does not match the order', async () => {
    const order = await placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 2 }]);
    await expect(
      as(db, service, async (tx) => {
        await tx.query(`select public.register_payment_attempt($1, 'razorpay', 'order_mismatch', $2)`, [order.id, order.total_paise]);
        await tx.query(`select public.confirm_payment($1, 'order_mismatch', 'pay_mismatch', 100)`, [order.id]);
      }),
    ).rejects.toThrow(/does not match/);
    await as(db, student(bob), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [order.id]));
  });

  it('a paid order cannot be cancelled by the student', async () => {
    const order = await placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 1 }]);
    await payOrder(db, order);
    await expect(
      as(db, student(bob), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [order.id])),
    ).rejects.toThrow(/already been paid/);
  });

  it('marks simulated (demo) payments distinctly', async () => {
    const order = await placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 1 }]);
    const r = await as(db, service, async (tx) => (await tx.query<OrderRow>(`select * from public.simulate_payment($1)`, [order.id])).rows[0]!);
    expect(r.payment_status).toBe('simulated');
    expect(r.order_status).toBe('placed');
  });
});

describe('privacy', () => {
  it("students cannot see another student's orders, items, payments or profile", async () => {
    const order = await placeOrder(db, alice, [{ menu_item_id: ITEMS.chai, quantity: 1 }]);
    await payOrder(db, order);
    const seen = await as(db, student(bob), async (tx) => ({
      orders: (await tx.query(`select id from public.orders where id = $1`, [order.id])).rows.length,
      items: (await tx.query(`select id from public.order_items where order_id = $1`, [order.id])).rows.length,
      payments: (await tx.query(`select id from public.payments where order_id = $1`, [order.id])).rows.length,
      events: (await tx.query(`select id from public.order_status_events where order_id = $1`, [order.id])).rows.length,
      profile: (await tx.query(`select id from public.profiles where id = $1`, [alice])).rows.length,
    }));
    expect(seen).toEqual({ orders: 0, items: 0, payments: 0, events: 0, profile: 0 });

    const own = await as(db, student(alice), async (tx) => (await tx.query(`select id from public.orders where id = $1`, [order.id])).rows.length);
    expect(own).toBe(1);
  });

  it('anonymous visitors cannot read orders or profiles', async () => {
    await expect(as(db, anon, (tx) => tx.query(`select * from public.orders`))).rejects.toThrow(/permission denied/);
    await expect(as(db, anon, (tx) => tx.query(`select * from public.profiles`))).rejects.toThrow(/permission denied/);
  });

  it('students cannot cancel someone else\'s order', async () => {
    const order = await placeOrder(db, alice, [{ menu_item_id: ITEMS.chai, quantity: 1 }]);
    await expect(
      as(db, student(bob), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [order.id])),
    ).rejects.toThrow(/not found/);
    await as(db, student(alice), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [order.id]));
  });
});

describe('roles & permissions', () => {
  it('students cannot promote themselves', async () => {
    await expect(
      as(db, student(alice), (tx) => tx.query(`update public.profiles set role = 'admin' where id = $1`, [alice])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, student(alice), (tx) => tx.query(`select public.admin_set_role('alice@example.edu', 'admin')`)),
    ).rejects.toThrow(/Only administrators/);
    const r = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [alice]);
    expect(r.rows[0]!.role).toBe('student');
  });

  it('students can update only their display name', async () => {
    await as(db, student(alice), (tx) => tx.query(`update public.profiles set display_name = 'Alice K' where id = $1`, [alice]));
    // Updating another user's name silently affects zero rows under RLS.
    await as(db, student(alice), (tx) => tx.query(`update public.profiles set display_name = 'hacked' where id = $1`, [bob]));
    const r = await db.query<{ id: string; display_name: string }>(`select id, display_name from public.profiles where id in ($1, $2)`, [alice, bob]);
    const names = Object.fromEntries(r.rows.map((x) => [x.id, x.display_name]));
    expect(names[alice]).toBe('Alice K');
    expect(names[bob]).toBe('Bob');
  });

  it('students cannot change menu prices or settings', async () => {
    await as(db, student(alice), (tx) => tx.query(`update public.menu_items set price_paise = 100 where id = $1`, [ITEMS.masalaDosa]));
    await as(db, student(alice), (tx) => tx.query(`update public.canteen_settings set service_fee_paise = 0, accepting_orders = false`));
    const price = await db.query<{ price_paise: number }>(`select price_paise from public.menu_items where id = $1`, [ITEMS.masalaDosa]);
    expect(price.rows[0]!.price_paise).toBe(6000);
    const s = await db.query<{ accepting_orders: boolean }>(`select accepting_orders from public.canteen_settings`);
    expect(s.rows[0]!.accepting_orders).toBe(true);
    await expect(
      as(db, student(alice), (tx) =>
        tx.query(`insert into public.menu_items (category_id, name, price_paise) values ('10000000-0000-4000-8000-000000000001', 'Free food', 100)`),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('staff can manage the menu; menu items with order history cannot be deleted', async () => {
    await as(db, student(staff), (tx) => tx.query(`update public.menu_items set price_paise = 6500 where id = $1`, [ITEMS.masalaDosa]));
    const price = await db.query<{ price_paise: number }>(`select price_paise from public.menu_items where id = $1`, [ITEMS.masalaDosa]);
    expect(price.rows[0]!.price_paise).toBe(6500);
    await expect(
      as(db, student(staff), (tx) => tx.query(`delete from public.menu_items where id = $1`, [ITEMS.masalaDosa])),
    ).rejects.toThrow(/foreign key/);
    await expect(
      as(db, student(staff), (tx) => tx.query(`update public.menu_items set price_paise = -5 where id = $1`, [ITEMS.masalaDosa])),
    ).rejects.toThrow(/check constraint/);
    await expect(
      as(db, student(staff), (tx) => tx.query(`update public.menu_items set stock_quantity = -1 where id = $1`, [ITEMS.masalaDosa])),
    ).rejects.toThrow(/check constraint/);
    await db.query(`update public.menu_items set price_paise = 6000 where id = $1`, [ITEMS.masalaDosa]);
  });

  it('staff cannot change roles; admins can, but not demote themselves', async () => {
    await expect(
      as(db, student(staff), (tx) => tx.query(`select public.admin_set_role('bob@example.edu', 'admin')`)),
    ).rejects.toThrow(/Only administrators/);
    await as(db, student(admin), (tx) => tx.query(`select public.admin_set_role('bob@example.edu', 'staff')`));
    let r = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [bob]);
    expect(r.rows[0]!.role).toBe('staff');
    await as(db, student(admin), (tx) => tx.query(`select public.admin_set_role('BOB@example.edu', 'student')`));
    r = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [bob]);
    expect(r.rows[0]!.role).toBe('student');
    await expect(
      as(db, student(admin), (tx) => tx.query(`select public.admin_set_role('admin@example.edu', 'student')`)),
    ).rejects.toThrow(/your own administrator/);
  });

  it('enforces the optional campus email domain at sign-up', async () => {
    await db.query(`update public.canteen_settings set allowed_email_domains = '{campus.edu.in}'`);
    await expect(createUser(db, { email: 'outsider@gmail.com' })).rejects.toThrow(/approved campus email/);
    await expect(createUser(db, { email: 'insider@Campus.edu.in' })).resolves.toBeTypeOf('string');
    await db.query(`update public.canteen_settings set allowed_email_domains = '{}'`);
  });
});

describe('staff order workflow', () => {
  it('UI actions match the transitions the database allows', async () => {
    const pairs = [
      ...Object.entries(NEXT_STAFF_ACTION).map(([from, a]) => [from, a!.to]),
      ...REJECTABLE.map((from) => [from, 'rejected']),
    ];
    for (const [from, to] of pairs) {
      const r = await db.query<{ ok: boolean }>(`select public.is_valid_order_transition($1, $2) as ok`, [from, to]);
      expect(r.rows[0]!.ok, `${from} -> ${to}`).toBe(true);
    }
  });

  it('moves an order through the legal lifecycle and records timestamps', async () => {
    const order = await placeOrder(db, alice, [{ menu_item_id: ITEMS.masalaDosa, quantity: 1 }]);
    const { order: placed } = await payOrder(db, order);

    await expect(updateStatus(alice, placed, 'placed', 'accepted')).rejects.toThrow(/Only canteen staff/);
    await expect(updateStatus(staff, placed, 'placed', 'completed')).rejects.toThrow(/Cannot move/);

    let o = await updateStatus(staff, placed, 'placed', 'accepted');
    expect(o.order_status).toBe('accepted');
    // A second staff member clicking the same button is refused.
    await expect(updateStatus(staff, placed, 'placed', 'accepted')).rejects.toThrow(/already updated/);
    o = await updateStatus(staff, o, 'accepted', 'preparing');
    o = await updateStatus(staff, o, 'preparing', 'ready');
    o = await updateStatus(staff, o, 'ready', 'completed');
    expect(o.order_status).toBe('completed');

    const t = await db.query<Record<string, string | null>>(
      `select accepted_at, preparing_at, ready_at, completed_at from public.orders where id = $1`,
      [order.id],
    );
    expect(Object.values(t.rows[0]!).every(Boolean)).toBe(true);

    const events = await as(db, student(alice), async (tx) =>
      (await tx.query<{ to_status: string }>(`select to_status from public.order_status_events where order_id = $1 order by id`, [order.id])).rows.map((e) => e.to_status),
    );
    expect(events).toEqual(['awaiting_payment', 'placed', 'accepted', 'preparing', 'ready', 'completed']);
  });

  it('cannot accept an unpaid order', async () => {
    const order = await placeOrder(db, bob, [{ menu_item_id: ITEMS.chai, quantity: 1 }]);
    await expect(updateStatus(staff, order, 'awaiting_payment', 'accepted')).rejects.toThrow(/Cannot move/);
    await as(db, student(bob), (tx) => tx.query(`select public.cancel_unpaid_order($1)`, [order.id]));
  });

  it('requires a reason to reject and releases reserved stock', async () => {
    const before = (await stockOf(db, ITEMS.brownie))!;
    const order = await placeOrder(db, alice, [{ menu_item_id: ITEMS.brownie, quantity: 3 }]);
    const { order: placed } = await payOrder(db, order);
    await expect(updateStatus(staff, placed, 'placed', 'rejected', '  ')).rejects.toThrow(/reason/);
    const rejected = await updateStatus(staff, placed, 'placed', 'rejected', 'Brownies ran out');
    expect(rejected.order_status).toBe('rejected');
    expect(rejected.status_note).toBe('Brownies ran out');
    expect(await stockOf(db, ITEMS.brownie)).toBe(before);
  });
});

describe('reports', () => {
  it('count only verified payments as revenue and keep demo payments separate', async () => {
    const today = (await db.query<{ d: string }>(`select public.app_today()::text as d`)).rows[0]!.d;
    const summary = await as(db, student(staff), async (tx) =>
      (await tx.query<{ s: Record<string, number> }>(`select public.report_summary($1::date, $1::date) as s`, [today])).rows[0]!.s,
    );
    const expected = await db.query<{ revenue: number; simulated: number }>(`
      select coalesce(sum(total_paise) filter (where payment_status = 'paid' and order_status not in ('rejected','cancelled')), 0)::int as revenue,
             count(*) filter (where payment_status = 'simulated')::int as simulated
        from public.orders where placed_at is not null`);
    expect(summary.revenue_paise).toBe(expected.rows[0]!.revenue);
    expect(summary.simulated_orders).toBe(expected.rows[0]!.simulated);
    expect(summary.revenue_paise).toBeGreaterThan(0);

    const overview = await as(db, student(staff), async (tx) =>
      (await tx.query<{ o: Record<string, number> }>(`select public.admin_overview() as o`)).rows[0]!.o,
    );
    expect(overview.revenue_today_paise).toBe(expected.rows[0]!.revenue);

    const daily = await as(db, student(admin), async (tx) =>
      (await tx.query<{ revenue_paise: string }>(`select * from public.report_daily($1::date - 6, $1::date)`, [today])).rows,
    );
    expect(daily).toHaveLength(7);
    expect(Number(daily[6]!.revenue_paise)).toBe(expected.rows[0]!.revenue);
  });

  it('are not available to students', async () => {
    await expect(
      as(db, student(alice), (tx) => tx.query(`select public.report_summary(current_date, current_date)`)),
    ).rejects.toThrow(/Only canteen staff/);
    await expect(as(db, student(alice), (tx) => tx.query(`select public.admin_overview()`))).rejects.toThrow(/Only canteen staff/);
  });

  it('public popularity is aggregate-only and based on paid orders', async () => {
    const rows = await as(db, anon, async (tx) =>
      (await tx.query<{ menu_item_id: string; units_sold: string }>(`select * from public.get_popular_items(30, 8)`)).rows,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]!).sort()).toEqual(['menu_item_id', 'order_count', 'units_sold']);
  });
});
