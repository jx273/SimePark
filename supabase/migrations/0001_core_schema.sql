-- ============================================================================
-- SimePark — 0001 core schema
-- ============================================================================
-- Run this file in the Supabase SQL Editor (or with `supabase db push`).
-- It is idempotent: re-running it will not destroy existing data.
--
-- Design notes
--  * The public property catalogue and private user data are separate tables
--    with separate policies. A user row never contains property facts, and a
--    property row never contains user data.
--  * Unknown values are stored as NULL, never as 0 or an empty string, so the
--    UI can distinguish "not recorded" from "zero".
--  * Provenance (source_url, verified_date, is_example) is part of the property
--    record itself, so a listing can never be labelled "verified" in the UI
--    without a genuine verification date behind it.
--  * Idempotent: safe to re-run against an existing project.
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helper: keep updated_at honest
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- Administrator role management
-- ============================================================================
-- Admin status lives in its own table rather than a column on profiles, for two
-- reasons:
--   1. There is NO insert/update/delete policy on this table at all, so no API
--      request from any authenticated user can grant a role — not even their
--      own. Roles can only be granted from the Supabase SQL Editor or by a
--      service_role key.
--   2. Membership can be audited independently of the profile row.
-- is_admin() is SECURITY DEFINER so policies on other tables can consult it
-- without needing read access to this table.
-- ============================================================================
create table if not exists public.admin_user_ids (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  note        text,
  granted_at  timestamptz not null default now()
);

comment on table public.admin_user_ids is
  'Administrator allow-list. Deliberately has no write policies: roles are granted only from the SQL Editor or with a service_role key.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_user_ids a where a.user_id = auth.uid()
  );
$$;

comment on function public.is_admin() is
  'True when the current JWT belongs to an administrator.';

-- Helper is callable by signed-in users only; anonymous callers get false.
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ============================================================================
-- User profiles
-- ============================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 80),
  language      text not null default 'en' check (language in ('en', 'ms', 'zh')),
  theme         text not null default 'system' check (theme in ('light', 'dark', 'system')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is
  'One row per authenticated user. Created automatically on signup; contains no financial data.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row on signup. SECURITY DEFINER so it works regardless of
-- the new user's policies at the moment of creation.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- User preferences
-- ============================================================================
-- Stored as explicit columns rather than a JSON blob so the values can be
-- constrained and so a future query can rely on their types.
create table if not exists public.user_preferences (
  user_id                    uuid primary key references auth.users (id) on delete cascade,
  preferred_location         text    check (preferred_location is null or char_length(preferred_location) <= 120),
  min_bedrooms               integer check (min_bedrooms is null or min_bedrooms between 0 and 20),
  preferred_max_monthly      numeric check (preferred_max_monthly is null or preferred_max_monthly >= 0),
  default_income             numeric check (default_income is null or default_income >= 0),
  default_debts              numeric check (default_debts is null or default_debts >= 0),
  default_down_payment       numeric check (default_down_payment is null or default_down_payment >= 0),
  default_interest_rate      numeric check (default_interest_rate is null or default_interest_rate between 0 and 100),
  default_loan_tenure_years  integer check (default_loan_tenure_years is null or default_loan_tenure_years between 0 and 60),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

drop trigger if exists user_preferences_set_updated_at on public.user_preferences;
create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Saved affordability scenarios
-- ============================================================================
create table if not exists public.saved_scenarios (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null check (char_length(trim(name)) between 1 and 80),
  monthly_income    numeric not null check (monthly_income >= 0),
  monthly_debts     numeric not null default 0 check (monthly_debts >= 0),
  down_payment      numeric not null default 0 check (down_payment >= 0),
  interest_rate     numeric not null check (interest_rate between 0 and 100),
  loan_tenure_years integer not null check (loan_tenure_years between 1 and 60),
  preferred_max_monthly numeric check (preferred_max_monthly is null or preferred_max_monthly >= 0),
  -- Result snapshot, so a saved scenario keeps the figures the user saw even if
  -- the calculation rules are later revised. Clearly labelled as a snapshot.
  result_snapshot   jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists saved_scenarios_user_id_created_at_idx
  on public.saved_scenarios (user_id, created_at desc);

drop trigger if exists saved_scenarios_set_updated_at on public.saved_scenarios;
create trigger saved_scenarios_set_updated_at
  before update on public.saved_scenarios
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Public property catalogue
-- ============================================================================
-- `price_myr` and the fact columns are nullable on purpose: a partially known
-- listing is allowed, and NULL means "not recorded". The UI must render NULL as
-- "Not recorded" and must never substitute a guess.
create table if not exists public.properties (
  id             text primary key check (char_length(id) between 1 and 64),
  property_name  text not null check (char_length(trim(property_name)) between 1 and 160),
  location       text not null check (char_length(trim(location)) between 1 and 200),
  price_myr      numeric check (price_myr is null or price_myr > 0),
  property_type  text,
  bedrooms       integer check (bedrooms is null or bedrooms between 0 and 50),
  bathrooms      integer check (bathrooms is null or bathrooms between 0 and 50),
  built_up_sqft  integer check (built_up_sqft is null or built_up_sqft > 0),
  -- Provenance
  source_url     text check (source_url is null or source_url ~* '^https://'),
  verified_date  date,
  is_example     boolean not null default true,
  -- Publication
  is_published   boolean not null default false,
  -- Bookkeeping
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A property may not claim both "demo data" and a genuine verification date.
  -- Demo records are for interface testing and are not verified listings.
  constraint properties_example_not_verified
    check (not (is_example and verified_date is not null))
);

create index if not exists properties_public_listing_idx
  on public.properties (is_published, price_myr)
  where is_published;

create index if not exists properties_location_idx
  on public.properties (location);

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

comment on table public.properties is
  'Public property catalogue. is_published controls public visibility. Provenance columns are authoritative; the UI labels status from them and never infers verification.';

comment on constraint properties_example_not_verified on public.properties is
  'Guards the honesty rule: demonstration records cannot carry a verification date.';

-- ============================================================================
-- Saved homes (favourites)
-- ============================================================================
create table if not exists public.saved_properties (
  user_id     uuid not null references auth.users (id) on delete cascade,
  property_id text not null references public.properties (id) on delete cascade,
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  primary key (user_id, property_id)
);

create index if not exists saved_properties_user_idx
  on public.saved_properties (user_id, created_at desc);

-- ============================================================================
-- Comparison history
-- ============================================================================
-- One row per property that has taken part in a comparison set. `set_id` groups
-- the properties the user compared together, so history can be replayed.
create table if not exists public.comparison_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  set_id      uuid not null default gen_random_uuid(),
  property_id text not null references public.properties (id) on delete cascade,
  compared_at timestamptz not null default now()
);

create index if not exists comparison_history_user_idx
  on public.comparison_history (user_id, compared_at desc);

create index if not exists comparison_history_set_idx
  on public.comparison_history (user_id, set_id);

-- ============================================================================
-- Activity log
-- ============================================================================
-- Powers the dashboard "recent activity" list. Deliberately stores no financial
-- values: only which property was viewed/saved/compared and when.
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  action      text not null check (action in ('viewed', 'saved', 'unsaved', 'compared', 'scenario_saved')),
  property_id text references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint activity_log_property_required
    check (action = 'scenario_saved' or property_id is not null)
);

create index if not exists activity_log_user_idx
  on public.activity_log (user_id, created_at desc);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.user_preferences   enable row level security;
alter table public.saved_scenarios    enable row level security;
alter table public.properties         enable row level security;
alter table public.saved_properties   enable row level security;
alter table public.comparison_history enable row level security;
alter table public.activity_log       enable row level security;
alter table public.admin_user_ids     enable row level security;

-- ---------------------------------------------------------------------------
-- admin_user_ids: RLS enabled, and intentionally NO policies.
-- With RLS on and no policy, every anon/authenticated request is denied. Only
-- the service_role (which bypasses RLS) or the SQL Editor can read or write it.
-- This is what makes self-promotion to administrator impossible from the app.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- properties: anyone may read published rows; only admins may write.
-- ---------------------------------------------------------------------------
drop policy if exists properties_public_read on public.properties;
create policy properties_public_read
  on public.properties
  for select
  to anon, authenticated
  using (is_published);

drop policy if exists properties_admin_read_all on public.properties;
create policy properties_admin_read_all
  on public.properties
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists properties_admin_insert on public.properties;
create policy properties_admin_insert
  on public.properties
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists properties_admin_update on public.properties;
create policy properties_admin_update
  on public.properties
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists properties_admin_delete on public.properties;
create policy properties_admin_delete
  on public.properties
  for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles: a user reads and updates only their own row.
-- There is no insert policy: rows are created by the signup trigger. There is
-- no delete policy: deletion cascades from auth.users.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- user_preferences: own row only.
-- ---------------------------------------------------------------------------
drop policy if exists user_preferences_select_own on public.user_preferences;
create policy user_preferences_select_own
  on public.user_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own
  on public.user_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own
  on public.user_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- saved_scenarios: own rows only.
-- ---------------------------------------------------------------------------
drop policy if exists saved_scenarios_select_own on public.saved_scenarios;
create policy saved_scenarios_select_own
  on public.saved_scenarios
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists saved_scenarios_insert_own on public.saved_scenarios;
create policy saved_scenarios_insert_own
  on public.saved_scenarios
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists saved_scenarios_update_own on public.saved_scenarios;
create policy saved_scenarios_update_own
  on public.saved_scenarios
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists saved_scenarios_delete_own on public.saved_scenarios;
create policy saved_scenarios_delete_own
  on public.saved_scenarios
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- saved_properties: own rows only. Reading a property's public facts comes from
-- the properties table, not from this table, so no cross-user read is needed.
-- ---------------------------------------------------------------------------
drop policy if exists saved_properties_select_own on public.saved_properties;
create policy saved_properties_select_own
  on public.saved_properties
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists saved_properties_insert_own on public.saved_properties;
create policy saved_properties_insert_own
  on public.saved_properties
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists saved_properties_update_own on public.saved_properties;
create policy saved_properties_update_own
  on public.saved_properties
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists saved_properties_delete_own on public.saved_properties;
create policy saved_properties_delete_own
  on public.saved_properties
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- comparison_history: own rows only.
-- ---------------------------------------------------------------------------
drop policy if exists comparison_history_select_own on public.comparison_history;
create policy comparison_history_select_own
  on public.comparison_history
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists comparison_history_insert_own on public.comparison_history;
create policy comparison_history_insert_own
  on public.comparison_history
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists comparison_history_delete_own on public.comparison_history;
create policy comparison_history_delete_own
  on public.comparison_history
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- activity_log: own rows only.
-- ---------------------------------------------------------------------------
drop policy if exists activity_log_select_own on public.activity_log;
create policy activity_log_select_own
  on public.activity_log
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists activity_log_insert_own on public.activity_log;
create policy activity_log_insert_own
  on public.activity_log
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists activity_log_delete_own on public.activity_log;
create policy activity_log_delete_own
  on public.activity_log
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- Convenience: remove all of the current user's private data in one call
-- ============================================================================
-- Used by the dashboard "delete my saved data" action. SECURITY INVOKER (the
-- default), so RLS still applies and it can only ever affect the caller's rows.
create or replace function public.delete_my_data()
returns void
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from public.saved_properties   where user_id = auth.uid();
  delete from public.comparison_history where user_id = auth.uid();
  delete from public.activity_log       where user_id = auth.uid();
  delete from public.saved_scenarios    where user_id = auth.uid();
  delete from public.user_preferences   where user_id = auth.uid();
end;
$$;

revoke all on function public.delete_my_data() from public;
grant execute on function public.delete_my_data() to authenticated;
