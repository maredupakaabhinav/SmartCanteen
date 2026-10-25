-- =============================================================================
-- Smart Canteen — security: Row Level Security, grants, realtime and storage.
--
-- Principles
--  * Every table has RLS enabled. Nothing is readable or writable unless a
--    policy below allows it.
--  * Students never write to orders, order_items or payments directly. Orders
--    are created by place_order(); payment state is changed only by
--    service-role functions called from the trusted API after verification.
--  * Roles live in profiles.role. Students may update only their display name
--    (column-level grant), so they cannot promote themselves.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.canteen_settings    enable row level security;
alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.menu_items          enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.payments            enable row level security;
alter table public.order_status_events enable row level security;
alter table public.daily_counters      enable row level security;

-- ---------------------------------------------------------------------------
-- Start from zero privileges for client roles, then grant the minimum.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Settings: public read, admin write
grant select on public.canteen_settings to anon, authenticated;
grant update (
  canteen_name, location, contact_phone, contact_email, timezone, opening_time, closing_time,
  open_days, accepting_orders, announcement, service_fee_paise, allowed_email_domains
) on public.canteen_settings to authenticated;

create policy "Anyone can read canteen settings"
  on public.canteen_settings for select
  to anon, authenticated
  using (true);

create policy "Admins can update canteen settings"
  on public.canteen_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Profiles: own row (+ staff can read all for the order queue). Only the display name is writable.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "Users can read their own profile; staff can read all"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_staff());

create policy "Users can update their own display name"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Categories & menu: public read of active/non-archived rows, staff manage.
grant select on public.categories, public.menu_items to anon, authenticated;
grant insert, update, delete on public.categories, public.menu_items to authenticated;

create policy "Anyone can read active categories; staff read all"
  on public.categories for select
  to anon, authenticated
  using (is_active or public.is_staff());

create policy "Staff can create categories"
  on public.categories for insert to authenticated with check (public.is_staff());
create policy "Staff can update categories"
  on public.categories for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete categories"
  on public.categories for delete to authenticated using (public.is_staff());

create policy "Anyone can read menu items that are not archived; staff read all"
  on public.menu_items for select
  to anon, authenticated
  using (not is_archived or public.is_staff());

create policy "Staff can create menu items"
  on public.menu_items for insert to authenticated with check (public.is_staff());
create policy "Staff can update menu items"
  on public.menu_items for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "Staff can delete menu items"
  on public.menu_items for delete to authenticated using (public.is_staff());

-- Orders & related: read-only for clients; students see only their own.
grant select on public.orders, public.order_items, public.payments, public.order_status_events to authenticated;

create policy "Students read their own orders; staff read all"
  on public.orders for select
  to authenticated
  using (user_id = auth.uid() or public.is_staff());

create policy "Students read their own order items; staff read all"
  on public.order_items for select
  to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

create policy "Students read their own payments; staff read all"
  on public.payments for select
  to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

create policy "Students read their own order history; staff read all"
  on public.order_status_events for select
  to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  );

-- daily_counters: no client access at all (no grants, no policies).

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
-- Used inside RLS policies and the public site.
grant execute on function public.current_role_name() to anon, authenticated;
grant execute on function public.is_staff()          to anon, authenticated;
grant execute on function public.is_admin()          to anon, authenticated;
grant execute on function public.app_timezone()      to anon, authenticated;
grant execute on function public.app_today()         to anon, authenticated;
grant execute on function public.is_canteen_open()   to anon, authenticated;
grant execute on function public.get_popular_items(integer, integer) to anon, authenticated;

-- Signed-in users (each function checks ownership / role itself).
grant execute on function public.place_order(jsonb, uuid, text, text)  to authenticated;
grant execute on function public.cancel_unpaid_order(uuid)             to authenticated;
grant execute on function public.expire_stale_orders()                 to authenticated;
grant execute on function public.update_order_status(uuid, public.order_status, public.order_status, text) to authenticated;
grant execute on function public.admin_set_role(text, public.user_role) to authenticated;
grant execute on function public.admin_overview()                      to authenticated;
grant execute on function public.report_summary(date, date)            to authenticated;
grant execute on function public.report_daily(date, date)              to authenticated;
grant execute on function public.report_top_items(date, date, integer) to authenticated;
grant execute on function public.report_payment_outcomes(date, date)   to authenticated;
grant execute on function public.report_status_distribution(date, date) to authenticated;

-- register_payment_attempt, confirm_payment, record_payment_failure and
-- simulate_payment stay service_role only (granted above via "all functions").

-- ---------------------------------------------------------------------------
-- Realtime (Supabase only). Realtime respects the RLS policies above.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.menu_items, public.canteen_settings;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket for menu photos (Supabase only): public read, staff write.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('menu-images', 'menu-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$
      create policy "Public can view menu images"
        on storage.objects for select
        using (bucket_id = 'menu-images')
    $p$;
    execute $p$
      create policy "Staff can upload menu images"
        on storage.objects for insert to authenticated
        with check (bucket_id = 'menu-images' and public.is_staff())
    $p$;
    execute $p$
      create policy "Staff can update menu images"
        on storage.objects for update to authenticated
        using (bucket_id = 'menu-images' and public.is_staff())
    $p$;
    execute $p$
      create policy "Staff can delete menu images"
        on storage.objects for delete to authenticated
        using (bucket_id = 'menu-images' and public.is_staff())
    $p$;
  end if;
end;
$$;
