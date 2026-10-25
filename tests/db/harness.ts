/**
 * In-process Postgres (PGlite) harness for testing the real migrations, RLS
 * policies and SQL functions without Docker. It recreates the small part of
 * Supabase the schema depends on: the anon / authenticated / service_role
 * roles, the auth.users table and auth.uid().
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const ROOT = join(import.meta.dirname, '..', '..', 'supabase');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export type Db = PGlite;
export type Tx = Transaction;
export type Actor =
  | { role: 'anon' }
  | { role: 'authenticated'; uid: string }
  | { role: 'service_role' };

export async function createTestDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const migrations = readdirSync(join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(ROOT, 'migrations', file), 'utf8'));
  }
  await db.exec(readFileSync(join(ROOT, 'seed.sql'), 'utf8'));
  // Keep the canteen open regardless of when the tests run.
  await db.exec(`update public.canteen_settings set opening_time = '00:00', closing_time = '23:59:59', open_days = '{1,2,3,4,5,6,7}'`);
  return db;
}

export async function createUser(
  db: Db,
  opts: { email?: string; name?: string; role?: 'student' | 'staff' | 'admin' } = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    opts.email ?? `${id.slice(0, 8)}@example.edu`,
    JSON.stringify({ display_name: opts.name ?? 'Test Student' }),
  ]);
  if (opts.role && opts.role !== 'student') {
    await db.query(`update public.profiles set role = $2 where id = $1`, [id, opts.role]);
  }
  return id;
}

/** Run `fn` inside a transaction as the given Supabase role (rolled back on error). */
export async function as<T>(db: Db, actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${actor.role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      actor.role === 'authenticated' ? actor.uid : '',
    ]);
    return fn(tx);
  });
}

export const student = (uid: string): Actor => ({ role: 'authenticated', uid });
export const service: Actor = { role: 'service_role' };
export const anon: Actor = { role: 'anon' };

export const ITEMS = {
  masalaDosa: '20000000-0000-4000-8000-000000000001',
  samosa: '20000000-0000-4000-8000-000000000011', // stock 40
  paneerTikka: '20000000-0000-4000-8000-000000000015', // unavailable
  chai: '20000000-0000-4000-8000-000000000016',
  brownie: '20000000-0000-4000-8000-000000000022', // stock 12
} as const;

export interface OrderRow {
  id: string;
  order_number: string;
  user_id: string;
  subtotal_paise: number;
  charges_paise: number;
  total_paise: number;
  payment_status: string;
  order_status: string;
  pickup_number: number | null;
  status_note: string | null;
}

export async function placeOrder(
  db: Db,
  uid: string,
  items: { menu_item_id: string; quantity: number; [k: string]: unknown }[],
  key: string = randomUUID(),
): Promise<OrderRow> {
  return as(db, student(uid), async (tx) => {
    const res = await tx.query<OrderRow>(`select * from public.place_order($1::jsonb, $2::uuid, null, null)`, [
      JSON.stringify(items),
      key,
    ]);
    return res.rows[0]!;
  });
}

export async function stockOf(db: Db, itemId: string): Promise<number | null> {
  const res = await db.query<{ stock_quantity: number | null }>(
    `select stock_quantity from public.menu_items where id = $1`,
    [itemId],
  );
  return res.rows[0]!.stock_quantity;
}

/** Pay an order the way the trusted API does after Razorpay verification. */
export async function payOrder(db: Db, order: OrderRow, paymentId = `pay_${randomUUID().slice(0, 12)}`) {
  const providerOrderId = `order_${randomUUID().slice(0, 12)}`;
  return as(db, service, async (tx) => {
    await tx.query(`select public.register_payment_attempt($1, 'razorpay', $2, $3)`, [
      order.id,
      providerOrderId,
      order.total_paise,
    ]);
    const res = await tx.query<OrderRow>(`select * from public.confirm_payment($1, $2, $3, $4)`, [
      order.id,
      providerOrderId,
      paymentId,
      order.total_paise,
    ]);
    return { order: res.rows[0]!, providerOrderId, paymentId };
  });
}
