-- =============================================================================
-- Smart Canteen — order & payment workflow
-- Every state change to an order happens inside one of these functions so that
-- prices, totals, stock and status transitions are always decided by the
-- database, never by the browser.
-- =============================================================================

-- Minutes an unpaid order holds its reserved stock before it expires.
create or replace function public.unpaid_order_ttl()
returns interval
language sql
immutable
as $$ select interval '30 minutes' $$;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public.release_order_stock(p_order_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.menu_items m
     set stock_quantity = m.stock_quantity + oi.qty
    from (
      select menu_item_id, sum(quantity)::integer as qty
        from public.order_items
       where order_id = p_order_id
       group by menu_item_id
    ) oi
   where m.id = oi.menu_item_id
     and m.stock_quantity is not null;
$$;

create or replace function public.log_order_event(
  p_order_id uuid,
  p_from public.order_status,
  p_to public.order_status,
  p_note text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_status_events (order_id, from_status, to_status, note, actor_id)
  values (p_order_id, p_from, p_to, p_note, auth.uid());
$$;

-- Expire unpaid orders that have held stock for too long.
create or replace function public.expire_stale_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id
      from public.orders
     where order_status = 'awaiting_payment'
       and created_at < now() - public.unpaid_order_ttl()
     for update skip locked
  loop
    perform public.release_order_stock(r.id);
    update public.orders
       set order_status   = 'cancelled',
           payment_status = 'cancelled',
           status_note    = 'Payment was not completed in time.',
           closed_at      = now()
     where id = r.id;
    perform public.log_order_event(r.id, 'awaiting_payment', 'cancelled', 'Expired before payment');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- place_order — called by signed-in students.
-- p_items: [{"menu_item_id": "<uuid>", "quantity": 2}, …]
-- Prices are read from the database; anything price-like in the payload is ignored.
-- Idempotent per (user, idempotency key).
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_items jsonb,
  p_idempotency_key uuid,
  p_customer_name text default null,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_existing  public.orders;
  v_order     public.orders;
  v_settings  public.canteen_settings;
  v_item      record;
  v_subtotal  integer := 0;
  v_count     integer;
  v_name      text;
begin
  if v_uid is null then
    raise exception 'Please sign in to place an order.' using errcode = '28000';
  end if;
  if p_idempotency_key is null then
    raise exception 'Missing idempotency key.' using errcode = '22023';
  end if;

  -- Same request submitted twice → return the original order.
  select * into v_existing
    from public.orders
   where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  if not public.is_canteen_open() then
    raise exception 'The canteen is not accepting orders right now.' using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;

  perform public.expire_stale_orders();

  select count(*) into v_count
    from public.orders
   where user_id = v_uid and order_status = 'awaiting_payment';
  if v_count >= 3 then
    raise exception 'You have too many unpaid orders. Complete or cancel one first.' using errcode = 'P0001';
  end if;

  -- Normalise the cart: merge duplicate lines, validate quantities.
  create temporary table if not exists pg_temp.cart_lines (
    menu_item_id uuid primary key,
    quantity     integer not null
  ) on commit drop;
  truncate pg_temp.cart_lines;

  begin
    insert into pg_temp.cart_lines (menu_item_id, quantity)
    select (e ->> 'menu_item_id')::uuid, sum((e ->> 'quantity')::integer)
      from jsonb_array_elements(p_items) e
     group by 1;
  exception when others then
    raise exception 'Your cart contains an invalid item.' using errcode = '22023';
  end;

  select count(*) into v_count from pg_temp.cart_lines;
  if v_count = 0 then
    raise exception 'Your cart is empty.' using errcode = '22023';
  end if;
  if v_count > 25 then
    raise exception 'Too many different items in one order.' using errcode = '22023';
  end if;
  if exists (select 1 from pg_temp.cart_lines where menu_item_id is null or quantity is null or quantity < 1 or quantity > 20) then
    raise exception 'Each item quantity must be between 1 and 20.' using errcode = '22023';
  end if;

  if exists (
    select 1
      from pg_temp.cart_lines l
      left join public.menu_items m on m.id = l.menu_item_id
     where m.id is null
  ) then
    raise exception 'An item in your cart is no longer on the menu.' using errcode = 'P0002';
  end if;

  -- Lock the menu rows in a stable order so concurrent orders cannot oversell.
  for v_item in
    select m.id, m.name, m.price_paise, m.is_available, m.is_archived, m.stock_quantity,
           c.is_active as category_active, l.quantity
      from pg_temp.cart_lines l
      join public.menu_items m on m.id = l.menu_item_id
      join public.categories c on c.id = m.category_id
     order by m.id
       for update of m
  loop
    if v_item.is_archived or not v_item.category_active then
      raise exception 'An item in your cart is no longer on the menu.' using errcode = 'P0002';
    end if;
    if not v_item.is_available then
      raise exception '% is currently unavailable.', v_item.name using errcode = 'P0002';
    end if;
    if v_item.stock_quantity is not null and v_item.stock_quantity < v_item.quantity then
      if v_item.stock_quantity = 0 then
        raise exception '% is sold out.', v_item.name using errcode = 'P0002';
      end if;
      raise exception 'Only % × % left.', v_item.stock_quantity, v_item.name using errcode = 'P0002';
    end if;
    v_subtotal := v_subtotal + v_item.price_paise * v_item.quantity;
  end loop;

  select * into v_settings from public.canteen_settings where id;

  v_name := nullif(left(trim(coalesce(p_customer_name, '')), 80), '');
  if v_name is null then
    select nullif(display_name, '') into v_name from public.profiles where id = v_uid;
  end if;

  insert into public.orders (
    order_number, user_id, customer_name, note,
    subtotal_paise, charges_paise, total_paise, idempotency_key
  )
  values (
    'SC-' || to_char(public.app_today(), 'YYMMDD') || '-' || lpad(public.next_daily_counter('order')::text, 4, '0'),
    v_uid,
    coalesce(v_name, ''),
    nullif(left(trim(coalesce(p_note, '')), 200), ''),
    v_subtotal,
    v_settings.service_fee_paise,
    v_subtotal + v_settings.service_fee_paise,
    p_idempotency_key
  )
  returning * into v_order;

  insert into public.order_items (order_id, menu_item_id, item_name_snapshot, unit_price_paise, quantity, line_total_paise)
  select v_order.id, m.id, m.name, m.price_paise, l.quantity, m.price_paise * l.quantity
    from pg_temp.cart_lines l
    join public.menu_items m on m.id = l.menu_item_id;

  update public.menu_items m
     set stock_quantity = m.stock_quantity - l.quantity
    from pg_temp.cart_lines l
   where m.id = l.menu_item_id
     and m.stock_quantity is not null;

  perform public.log_order_event(v_order.id, null, 'awaiting_payment', null);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_unpaid_order — a student cancels their own order before paying.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_unpaid_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.user_id is distinct from auth.uid() then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.order_status = 'cancelled' then
    return v_order;
  end if;
  if v_order.order_status <> 'awaiting_payment' or v_order.payment_status in ('paid', 'simulated') then
    raise exception 'This order has already been paid and can no longer be cancelled online.' using errcode = 'P0001';
  end if;

  perform public.release_order_stock(v_order.id);
  update public.orders
     set order_status = 'cancelled', payment_status = 'cancelled',
         status_note = 'Cancelled by you before payment.', closed_at = now()
   where id = v_order.id
   returning * into v_order;
  perform public.log_order_event(v_order.id, 'awaiting_payment', 'cancelled', 'Cancelled by student');
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment functions — SERVICE ROLE ONLY (called by the trusted API after the
-- payment provider's signature / status has been verified).
-- ---------------------------------------------------------------------------

-- Record a provider order (e.g. Razorpay order_id) for an order.
create or replace function public.register_payment_attempt(
  p_order_id uuid,
  p_provider text,
  p_provider_order_id text,
  p_amount_paise integer
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  insert into public.payments (order_id, provider, provider_order_id, amount_paise)
  values (p_order_id, p_provider, p_provider_order_id, p_amount_paise)
  on conflict (provider_order_id) do update set updated_at = now()
  returning * into v_payment;
  return v_payment;
end;
$$;

create or replace function public.confirm_payment(
  p_order_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_paise integer
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   public.orders;
  v_payment public.payments;
  v_pickup  integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  select * into v_payment
    from public.payments
   where provider_order_id = p_provider_order_id and order_id = p_order_id
   for update;
  if not found then
    raise exception 'Payment attempt not found for this order.' using errcode = 'P0002';
  end if;

  -- Idempotent: already confirmed with this payment.
  if v_payment.status = 'paid' then
    if v_payment.provider_payment_id is distinct from p_provider_payment_id then
      raise exception 'A different payment was already recorded for this attempt.' using errcode = 'P0001';
    end if;
    return v_order;
  end if;

  if p_amount_paise <> v_order.total_paise or p_amount_paise <> v_payment.amount_paise then
    update public.payments
       set status = 'failed', failure_reason = 'Amount mismatch', provider_payment_id = p_provider_payment_id
     where id = v_payment.id;
    raise exception 'Payment amount does not match the order total.' using errcode = 'P0001';
  end if;

  update public.payments
     set status = 'paid', provider_payment_id = p_provider_payment_id,
         verified_at = now(), failure_reason = null
   where id = v_payment.id;

  if v_order.payment_status = 'paid' then
    -- Another attempt already paid this order (e.g. retried checkout). Keep the first.
    return v_order;
  end if;

  if v_order.order_status = 'awaiting_payment' then
    v_pickup := public.next_daily_counter('pickup');
    update public.orders
       set payment_status = 'paid', order_status = 'placed', placed_at = now(),
           pickup_number = v_pickup, pickup_date = public.app_today(), status_note = null
     where id = v_order.id
     returning * into v_order;
    perform public.log_order_event(v_order.id, 'awaiting_payment', 'placed', 'Payment verified');
  else
    -- Paid after the order was cancelled/expired: keep the money trail visible for a refund.
    update public.orders
       set payment_status = 'paid',
           status_note = 'Payment was received after this order was cancelled. Please contact the counter for a refund.'
     where id = v_order.id
     returning * into v_order;
  end if;

  return v_order;
end;
$$;

create or replace function public.record_payment_failure(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  select * into v_payment from public.payments where provider_order_id = p_provider_order_id for update;
  if not found or v_payment.status in ('paid', 'simulated') then
    return;
  end if;
  update public.payments
     set status = 'failed', failure_reason = left(p_reason, 300),
         provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id)
   where id = v_payment.id;
  update public.orders
     set payment_status = 'failed'
   where id = v_payment.order_id and payment_status = 'pending';
end;
$$;

-- DEMO MODE ONLY: the API calls this only when PAYMENT_MODE=demo. The order is
-- marked 'simulated' (never 'paid') so it can never be mistaken for revenue.
create or replace function public.simulate_payment(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.orders;
  v_pickup integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;
  if v_order.payment_status = 'simulated' then
    return v_order;
  end if;
  if v_order.order_status <> 'awaiting_payment' then
    raise exception 'This order is no longer awaiting payment.' using errcode = 'P0001';
  end if;

  insert into public.payments (order_id, provider, amount_paise, status, verified_at)
  values (v_order.id, 'demo', v_order.total_paise, 'simulated', now());

  v_pickup := public.next_daily_counter('pickup');
  update public.orders
     set payment_status = 'simulated', order_status = 'placed', placed_at = now(),
         pickup_number = v_pickup, pickup_date = public.app_today()
   where id = v_order.id
   returning * into v_order;
  perform public.log_order_event(v_order.id, 'awaiting_payment', 'placed', 'Demo payment (simulated)');
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff status transitions
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_order_transition(
  p_from public.order_status,
  p_to public.order_status
)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('placed'::public.order_status,    'accepted'::public.order_status),
    ('placed',    'preparing'),
    ('placed',    'rejected'),
    ('accepted',  'preparing'),
    ('accepted',  'rejected'),
    ('preparing', 'ready'),
    ('ready',     'completed')
  );
$$;

create or replace function public.update_order_status(
  p_order_id uuid,
  p_expected_status public.order_status,
  p_new_status public.order_status,
  p_note text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_note  text := nullif(left(trim(coalesce(p_note, '')), 300), '');
begin
  if not public.is_staff() then
    raise exception 'Only canteen staff can update orders.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'P0002';
  end if;

  -- Optimistic concurrency: refuse if someone else already moved the order.
  if v_order.order_status <> p_expected_status then
    raise exception 'This order was already updated to "%". Refresh to see the latest status.', v_order.order_status
      using errcode = 'P0001';
  end if;

  if not public.is_valid_order_transition(v_order.order_status, p_new_status) then
    raise exception 'Cannot move an order from % to %.', v_order.order_status, p_new_status using errcode = 'P0001';
  end if;

  if p_new_status = 'rejected' and v_note is null then
    raise exception 'Please give a reason for rejecting this order.' using errcode = '22023';
  end if;

  if p_new_status = 'rejected' then
    perform public.release_order_stock(v_order.id);
  end if;

  update public.orders
     set order_status = p_new_status,
         status_note  = case when p_new_status = 'rejected' then v_note else status_note end,
         accepted_at  = case when p_new_status = 'accepted'  then now() else accepted_at end,
         preparing_at = case when p_new_status = 'preparing' then now() else preparing_at end,
         ready_at     = case when p_new_status = 'ready'     then now() else ready_at end,
         completed_at = case when p_new_status = 'completed' then now() else completed_at end,
         closed_at    = case when p_new_status = 'rejected'  then now() else closed_at end
   where id = v_order.id
   returning * into v_order;

  perform public.log_order_event(v_order.id, p_expected_status, p_new_status, v_note);
  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- Role management (admins only). Students can never call this successfully.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_role(p_email text, p_role public.user_role)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change roles.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where lower(email) = lower(trim(p_email)) for update;
  if not found then
    raise exception 'No account found for that email. Ask them to sign up first.' using errcode = 'P0002';
  end if;
  if v_profile.id = auth.uid() and p_role <> 'admin' then
    raise exception 'You cannot remove your own administrator access.' using errcode = 'P0001';
  end if;

  update public.profiles set role = p_role where id = v_profile.id returning * into v_profile;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public, aggregate-only popularity (no personal data leaves the function).
-- Counts units from verified, paid orders only.
-- ---------------------------------------------------------------------------
create or replace function public.get_popular_items(p_days integer default 30, p_limit integer default 8)
returns table (menu_item_id uuid, units_sold bigint, order_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select oi.menu_item_id, sum(oi.quantity)::bigint, count(distinct o.id)::bigint
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.menu_items m on m.id = oi.menu_item_id
   where o.payment_status = 'paid'
     and o.order_status not in ('rejected', 'cancelled')
     and o.placed_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
     and not m.is_archived
   group by oi.menu_item_id
   order by 2 desc, 3 desc
   limit greatest(1, least(p_limit, 24));
$$;
