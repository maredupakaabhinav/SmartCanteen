-- =============================================================================
-- Smart Canteen — core schema
-- Tables, enums, helper functions and triggers. Security (RLS + grants) lives in
-- a later migration so it can be reviewed on its own.
-- All money values are stored as integer paise (₹1 = 100 paise).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('student', 'staff', 'admin');

create type public.order_status as enum (
  'awaiting_payment', -- created, stock reserved, waiting for verified payment
  'placed',           -- payment verified (or simulated in demo mode); visible to the kitchen
  'accepted',
  'preparing',
  'ready',
  'completed',
  'rejected',         -- declined by staff (reason required)
  'cancelled'         -- cancelled by the student or expired before payment
);

create type public.payment_status as enum (
  'pending',   -- no verified payment yet
  'paid',      -- verified by trusted server logic
  'failed',    -- last attempt failed (student may retry)
  'cancelled', -- order cancelled before payment
  'simulated'  -- DEMO MODE ONLY — never counted as revenue
);

create type public.payment_record_status as enum ('created', 'paid', 'failed', 'simulated');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Canteen settings (single row)
-- ---------------------------------------------------------------------------
create table public.canteen_settings (
  id                    boolean primary key default true check (id),
  canteen_name          text not null default 'Smart Canteen' check (char_length(canteen_name) between 1 and 80),
  location              text check (char_length(location) <= 160),
  contact_phone         text check (char_length(contact_phone) <= 32),
  contact_email         text check (char_length(contact_email) <= 120),
  timezone              text not null default 'Asia/Kolkata',
  opening_time          time not null default '08:00',
  closing_time          time not null default '20:00',
  -- ISO day numbers, 1 = Monday … 7 = Sunday
  open_days             smallint[] not null default '{1,2,3,4,5,6}',
  accepting_orders      boolean not null default true,
  announcement          text check (char_length(announcement) <= 280),
  -- Transparent extra charge added to every order. 0 = no extra charges.
  service_fee_paise     integer not null default 0 check (service_fee_paise between 0 and 10000),
  -- Optional campus restriction, e.g. '{college.edu.in}'. Empty = any email domain.
  allowed_email_domains text[] not null default '{}',
  updated_at            timestamptz not null default now(),
  constraint canteen_hours_valid check (closing_time > opening_time),
  constraint canteen_days_valid check (open_days <@ '{1,2,3,4,5,6,7}'::smallint[])
);

insert into public.canteen_settings (id) values (true);

create trigger canteen_settings_updated_at
  before update on public.canteen_settings
  for each row execute function public.set_updated_at();

create or replace function public.app_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select timezone from public.canteen_settings where id), 'Asia/Kolkata');
$$;

-- The canteen's local calendar date (used for order numbers, pickup numbers and reports).
create or replace function public.app_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone public.app_timezone())::date;
$$;

create or replace function public.is_canteen_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.accepting_orders
       and extract(isodow from (now() at time zone s.timezone))::smallint = any (s.open_days)
       and (now() at time zone s.timezone)::time >= s.opening_time
       and (now() at time zone s.timezone)::time <  s.closing_time
    from public.canteen_settings s
    where s.id
  ), false);
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  email        text,
  role         public.user_role not null default 'student',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where role <> 'student';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role_name() in ('staff', 'admin'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role_name() = 'admin', false);
$$;

-- Create a profile for every new auth user and enforce the optional campus email domain.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domains text[];
  v_domain  text;
begin
  select allowed_email_domains into v_domains from public.canteen_settings where id;
  v_domain := lower(split_part(coalesce(new.email, ''), '@', 2));

  if coalesce(array_length(v_domains, 1), 0) > 0
     and not exists (select 1 from unnest(v_domains) d where lower(d) = v_domain) then
    raise exception 'Sign-up is limited to approved campus email addresses.'
      using errcode = 'P0001';
  end if;

  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile email in sync if the user changes it.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (char_length(description) <= 160),
  image_url   text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create table public.menu_items (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid not null references public.categories (id) on delete restrict,
  name           text not null check (char_length(trim(name)) between 1 and 80),
  description    text not null default '' check (char_length(description) <= 280),
  price_paise    integer not null check (price_paise between 100 and 1000000),
  image_url      text,
  -- null = not specified by the canteen; never assume.
  is_vegetarian  boolean,
  dietary_notes  text check (char_length(dietary_notes) <= 200),
  is_available   boolean not null default true,
  -- null = stock is not tracked for this item.
  stock_quantity integer check (stock_quantity >= 0),
  is_featured    boolean not null default false,
  is_archived    boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index menu_items_category_idx on public.menu_items (category_id) where not is_archived;

create trigger menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table public.daily_counters (
  business_date date not null,
  kind          text not null,
  value         integer not null default 0,
  primary key (business_date, kind)
);

create or replace function public.next_daily_counter(p_kind text)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.daily_counters as c (business_date, kind, value)
  values (public.app_today(), p_kind, 1)
  on conflict (business_date, kind) do update set value = c.value + 1
  returning value;
$$;

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  pickup_number    integer check (pickup_number > 0),
  pickup_date      date,
  user_id          uuid references public.profiles (id) on delete set null,
  customer_name    text not null default '' check (char_length(customer_name) <= 80),
  note             text check (char_length(note) <= 200),
  subtotal_paise   integer not null check (subtotal_paise >= 0),
  charges_paise    integer not null default 0 check (charges_paise >= 0),
  total_paise      integer not null check (total_paise >= 0),
  payment_status   public.payment_status not null default 'pending',
  order_status     public.order_status not null default 'awaiting_payment',
  idempotency_key  uuid not null,
  status_note      text check (char_length(status_note) <= 300),
  placed_at        timestamptz,
  accepted_at      timestamptz,
  preparing_at     timestamptz,
  ready_at         timestamptz,
  completed_at     timestamptz,
  closed_at        timestamptz, -- rejected or cancelled
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint orders_total_matches check (total_paise = subtotal_paise + charges_paise),
  constraint orders_idempotency_unique unique (user_id, idempotency_key),
  constraint orders_pickup_unique unique (pickup_date, pickup_number)
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (order_status, created_at desc);
create index orders_placed_at_idx on public.orders (placed_at desc) where placed_at is not null;
create index orders_awaiting_idx on public.orders (created_at) where order_status = 'awaiting_payment';

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  -- restrict: menu items with order history must be archived, not deleted.
  menu_item_id       uuid not null references public.menu_items (id) on delete restrict,
  item_name_snapshot text not null,
  unit_price_paise   integer not null check (unit_price_paise > 0),
  quantity           integer not null check (quantity between 1 and 20),
  line_total_paise   integer not null,
  created_at         timestamptz not null default now(),
  constraint order_items_line_total check (line_total_paise = unit_price_paise * quantity)
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_menu_item_idx on public.order_items (menu_item_id);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  provider            text not null check (provider in ('razorpay', 'demo')),
  provider_order_id   text unique,
  provider_payment_id text unique,
  amount_paise        integer not null check (amount_paise >= 0),
  currency            text not null default 'INR',
  status              public.payment_record_status not null default 'created',
  failure_reason      text check (char_length(failure_reason) <= 300),
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id);

create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create table public.order_status_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  note        text,
  actor_id    uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index order_status_events_order_idx on public.order_status_events (order_id, created_at);
