-- =============================================================================
-- Smart Canteen — reporting (staff only)
-- Every figure is computed from stored orders and payments. Revenue counts only
-- orders whose payment was verified by the server (payment_status = 'paid') and
-- which were not rejected or cancelled. Demo-mode (simulated) payments are
-- always reported separately and never added to revenue.
-- Dates are canteen-local calendar dates (canteen_settings.timezone).
-- =============================================================================

create or replace function public.assert_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'Only canteen staff can view reports.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.local_date(p_ts timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_ts at time zone public.app_timezone())::date;
$$;

-- Live operational snapshot for the dashboard.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.app_today();
  v_result jsonb;
begin
  perform public.assert_staff();

  select jsonb_build_object(
    'business_date',       v_today,
    'orders_today',        count(*) filter (where o.placed_at is not null and public.local_date(o.placed_at) = v_today),
    'revenue_today_paise', coalesce(sum(o.total_paise) filter (
                              where o.payment_status = 'paid'
                                and o.order_status not in ('rejected', 'cancelled')
                                and public.local_date(o.placed_at) = v_today), 0),
    'simulated_today',     count(*) filter (where o.payment_status = 'simulated' and public.local_date(o.placed_at) = v_today),
    'awaiting_payment',    count(*) filter (where o.order_status = 'awaiting_payment'),
    'new_orders',          count(*) filter (where o.order_status = 'placed'),
    'in_kitchen',          count(*) filter (where o.order_status in ('accepted', 'preparing')),
    'ready',               count(*) filter (where o.order_status = 'ready'),
    'completed_today',     count(*) filter (where o.order_status = 'completed' and public.local_date(o.completed_at) = v_today),
    'rejected_today',      count(*) filter (where o.order_status = 'rejected' and public.local_date(o.closed_at) = v_today)
  )
  into v_result
  from public.orders o
  where o.created_at >= now() - interval '3 days'
     or o.order_status in ('awaiting_payment', 'placed', 'accepted', 'preparing', 'ready');

  return v_result;
end;
$$;

create or replace function public.report_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.assert_staff();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a valid date range of up to one year.' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'orders',                  count(*),
    'paid_orders',             count(*) filter (where o.payment_status = 'paid' and o.order_status not in ('rejected', 'cancelled')),
    'revenue_paise',           coalesce(sum(o.total_paise) filter (where o.payment_status = 'paid' and o.order_status not in ('rejected', 'cancelled')), 0),
    'simulated_orders',        count(*) filter (where o.payment_status = 'simulated'),
    'simulated_amount_paise',  coalesce(sum(o.total_paise) filter (where o.payment_status = 'simulated'), 0),
    'rejected_orders',         count(*) filter (where o.order_status = 'rejected'),
    'refund_due_paise',        coalesce(sum(o.total_paise) filter (where o.payment_status = 'paid' and o.order_status in ('rejected', 'cancelled')), 0),
    'completed_orders',        count(*) filter (where o.order_status = 'completed')
  )
  into v_result
  from public.orders o
  where o.placed_at is not null
    and public.local_date(o.placed_at) between p_from and p_to;

  return v_result;
end;
$$;

create or replace function public.report_daily(p_from date, p_to date)
returns table (
  day date,
  orders bigint,
  paid_orders bigint,
  revenue_paise bigint,
  simulated_orders bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_staff();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a valid date range of up to one year.' using errcode = '22023';
  end if;

  return query
  with placed as (
    select public.local_date(o.placed_at) as d, o.total_paise, o.payment_status, o.order_status
      from public.orders o
     where o.placed_at is not null
       and public.local_date(o.placed_at) between p_from and p_to
  )
  select g.d::date,
         count(p.d),
         count(p.d) filter (where p.payment_status = 'paid' and p.order_status not in ('rejected', 'cancelled')),
         coalesce(sum(p.total_paise) filter (where p.payment_status = 'paid' and p.order_status not in ('rejected', 'cancelled')), 0)::bigint,
         count(p.d) filter (where p.payment_status = 'simulated')
    from generate_series(p_from, p_to, interval '1 day') g(d)
    left join placed p on p.d = g.d::date
   group by g.d
   order by g.d;
end;
$$;

create or replace function public.report_top_items(p_from date, p_to date, p_limit integer default 10)
returns table (
  menu_item_id uuid,
  item_name text,
  units_paid bigint,
  units_simulated bigint,
  revenue_paise bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_staff();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a valid date range of up to one year.' using errcode = '22023';
  end if;

  return query
  select oi.menu_item_id,
         (array_agg(oi.item_name_snapshot order by o.placed_at desc))[1],
         coalesce(sum(oi.quantity) filter (where o.payment_status = 'paid'), 0)::bigint,
         coalesce(sum(oi.quantity) filter (where o.payment_status = 'simulated'), 0)::bigint,
         coalesce(sum(oi.line_total_paise) filter (where o.payment_status = 'paid'), 0)::bigint
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where o.placed_at is not null
     and o.order_status not in ('rejected', 'cancelled')
     and public.local_date(o.placed_at) between p_from and p_to
   group by oi.menu_item_id
   order by 3 desc, 4 desc, 2
   limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

create or replace function public.report_payment_outcomes(p_from date, p_to date)
returns table (provider text, status public.payment_record_status, attempts bigint, amount_paise bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_staff();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a valid date range of up to one year.' using errcode = '22023';
  end if;

  return query
  select p.provider, p.status, count(*)::bigint, coalesce(sum(p.amount_paise), 0)::bigint
    from public.payments p
   where public.local_date(p.created_at) between p_from and p_to
   group by p.provider, p.status
   order by p.provider, p.status;
end;
$$;

create or replace function public.report_status_distribution(p_from date, p_to date)
returns table (order_status public.order_status, orders bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_staff();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Choose a valid date range of up to one year.' using errcode = '22023';
  end if;

  return query
  select o.order_status, count(*)::bigint
    from public.orders o
   where public.local_date(o.created_at) between p_from and p_to
   group by o.order_status
   order by 1;
end;
$$;
