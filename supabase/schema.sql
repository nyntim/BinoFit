-- BinoFit Supabase Schema
-- Run this in the Supabase SQL editor. Everything is idempotent.
--
-- Identity: every install signs in anonymously (Authentication > Providers > Anonymous Sign-Ins),
-- and `user_id` columns hold auth.uid()::text. Rows written before that hold the old device UUID
-- until the app calls claim_device_data().
--
-- Email + password accounts (Authentication > Providers > Email): enable the Email provider and
-- Anonymous sign-ins. Minimum password length 8. "Confirm email" may be on or off. If it is on,
-- the "Confirm email change" and "Reset password" templates must show {{ .Token }} (the 6-digit
-- code the app asks for), not only the link. Apple stays enabled for Sign in with Apple.
--
-- Deploy in two steps:
--   STEP A  tables, functions and the still-open policies. Safe for installs that predate auth.
--   STEP B  tightened row level security. Run only AFTER every device you use runs the build
--           with account support. Older builds stop syncing once B is applied.

-- ─────────────────────────────────────────────────────────
-- foods: extended/branded foods queried on cache miss
--        and custom user-created foods
-- ─────────────────────────────────────────────────────────
create table if not exists public.foods (
  id             text primary key,
  name           text not null,
  brand          text,
  serving_units  text,
  calories       real,
  protein        real,
  carbs          real,
  fat            real,
  source         text not null,   -- 'usda' | 'branded' | 'custom'
  user_id        text,            -- null = public food; auth.uid()::text = custom food
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists idx_foods_name on public.foods (name);
create index if not exists idx_foods_user_id on public.foods (user_id);

-- ─────────────────────────────────────────────────────────
-- Full-text and Fuzzy Search Indexes
-- ─────────────────────────────────────────────────────────
create extension if not exists pg_trgm;

-- Trigram index for fuzzy name matching (ilike %term%)
create index if not exists idx_foods_name_trgm on public.foods using gin (name gin_trgm_ops);
create index if not exists idx_foods_brand_trgm on public.foods using gin (brand gin_trgm_ops);

-- Full-text search index for token-based matching
create index if not exists idx_foods_fts on public.foods using gin (to_tsvector('english', name || ' ' || coalesce(brand, '')));

-- ─────────────────────────────────────────────────────────
-- food_logs: synced from local SQLite
-- ─────────────────────────────────────────────────────────
create table if not exists public.food_logs (
  id             text primary key,
  user_id        text not null,
  date           text not null,
  meal_slot      text not null,
  food_id        text not null,
  serving_amount real not null,
  serving_unit   text not null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  deleted_at     timestamptz   -- soft-delete marker for future reconciliation
);

create index if not exists idx_food_logs_user_date on public.food_logs (user_id, date);

-- ─────────────────────────────────────────────────────────
-- user_goals: synced from AsyncStorage
-- ─────────────────────────────────────────────────────────
create table if not exists public.user_goals (
  user_id       text primary key,
  calorie_goal  real,
  protein_goal  real,
  carb_goal     real,
  fat_goal      real,
  updated_at    timestamptz default now()
);

-- ─────────────────────────────────────────────────────────
-- user_profile: synced from AsyncStorage
-- ─────────────────────────────────────────────────────────
create table if not exists public.user_profile (
  user_id        text primary key,
  weight         real,
  height         real,
  activity_level text,
  updated_at     timestamptz default now()
);

-- ─────────────────────────────────────────────────────────
-- meal_definitions: user-defined meals (food_logs.meal_slot holds the id).
-- Push-only; deletions are not propagated.
-- ─────────────────────────────────────────────────────────
create table if not exists public.meal_definitions (
  user_id        text not null,
  id             text not null,
  position       integer not null,
  calorie_target real,
  protein_target real,
  carb_target    real,
  fat_target     real,
  reminder_time  text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  primary key (user_id, id)
);
alter table public.meal_definitions add column if not exists reminder_time text;

-- ─────────────────────────────────────────────────────────
-- meal_names: name history; a name applies from effective_from onward
-- ─────────────────────────────────────────────────────────
create table if not exists public.meal_names (
  user_id        text not null,
  meal_id        text not null,
  name           text not null,
  effective_from text not null,   -- yyyy-MM-dd
  updated_at     timestamptz default now(),
  primary key (user_id, meal_id, effective_from)
);

-- ─────────────────────────────────────────────────────────
-- weight_entries: body weight log (weight_kg is always kg). Soft-deleted via deleted_at.
-- New table, so it gets the strict per-user policy right away (no older build uses it).
-- ─────────────────────────────────────────────────────────
create table if not exists public.weight_entries (
  id          text primary key,
  user_id     text not null,
  date        text not null,   -- yyyy-MM-dd
  weight_kg   double precision not null,
  measured_at timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  deleted_at  timestamptz
);
create index if not exists idx_weight_entries_user_date on public.weight_entries (user_id, date);
alter table public.weight_entries enable row level security;
drop policy if exists "weight_entries: own rows" on public.weight_entries;
create policy "weight_entries: own rows"
  on public.weight_entries for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

-- ═════════════════════════════════════════════════════════
-- STEP A: run now. New tables and functions; open policies are kept so older app builds
-- keep syncing.
-- ═════════════════════════════════════════════════════════

-- Records which auth user took over which legacy device id. Clients have no direct access.
create table if not exists public.device_claims (
  device_id   text primary key,
  user_id     uuid not null,
  claimed_at  timestamptz not null default now()
);

-- One-time tickets that let the anonymous user hand its rows to the account it signs in to.
create table if not exists public.merge_tickets (
  id          uuid primary key default gen_random_uuid(),
  from_uid    uuid not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours',
  used_at     timestamptz,
  used_by     uuid
);

alter table public.device_claims enable row level security;
alter table public.merge_tickets enable row level security;
-- No policies on purpose: only the SECURITY DEFINER functions below touch these tables.
revoke all on table public.device_claims from anon, authenticated;
revoke all on table public.merge_tickets from anon, authenticated;

alter table public.foods         enable row level security;
alter table public.food_logs     enable row level security;
alter table public.user_goals    enable row level security;
alter table public.user_profile  enable row level security;
alter table public.meal_definitions enable row level security;
alter table public.meal_names       enable row level security;

-- Moves every row owned by p_from to p_to. Where both own the same key, p_to ("existing")
-- wins and p_from's row is dropped. Internal: not callable by clients.
create or replace function public._merge_user_rows(p_from text, p_to text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from = p_to then
    return;
  end if;

  -- Ids are globally unique, so these never conflict.
  update public.food_logs set user_id = p_to where user_id = p_from;
  update public.foods     set user_id = p_to where user_id = p_from;
  update public.weight_entries set user_id = p_to where user_id = p_from;

  delete from public.user_goals d
   where d.user_id = p_from
     and exists (select 1 from public.user_goals e where e.user_id = p_to);
  update public.user_goals set user_id = p_to where user_id = p_from;

  delete from public.user_profile d
   where d.user_id = p_from
     and exists (select 1 from public.user_profile e where e.user_id = p_to);
  update public.user_profile set user_id = p_to where user_id = p_from;

  -- Names first: a meal the account already defines keeps only the account's name history.
  delete from public.meal_names d
   where d.user_id = p_from
     and (
       exists (select 1 from public.meal_definitions e
                where e.user_id = p_to and e.id = d.meal_id)
       or exists (select 1 from public.meal_names e
                   where e.user_id = p_to and e.meal_id = d.meal_id
                     and e.effective_from = d.effective_from)
     );
  update public.meal_names set user_id = p_to where user_id = p_from;

  delete from public.meal_definitions d
   where d.user_id = p_from
     and exists (select 1 from public.meal_definitions e
                  where e.user_id = p_to and e.id = d.id);
  update public.meal_definitions set user_id = p_to where user_id = p_from;
end;
$$;
revoke all on function public._merge_user_rows(text, text) from public, anon, authenticated;

-- Reassigns rows stored under an old device UUID to the caller. Idempotent: the second call
-- by the same user does nothing; a device id claimed by another user is refused.
create or replace function public.claim_device_data(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_device_id is null or length(p_device_id) = 0 or p_device_id = v_uid::text
     or exists (select 1 from auth.users u where u.id::text = p_device_id) then
    raise exception 'invalid device id';
  end if;

  select c.user_id into v_owner from public.device_claims c where c.device_id = p_device_id;
  if found then
    if v_owner = v_uid then
      return jsonb_build_object('status', 'already_claimed');
    end if;
    raise exception 'device already claimed';
  end if;

  insert into public.device_claims (device_id, user_id) values (p_device_id, v_uid);
  perform public._merge_user_rows(p_device_id, v_uid::text);
  return jsonb_build_object('status', 'claimed');
end;
$$;

-- Called by the anonymous user before signing in. Returns a ticket valid for 24 hours.
create or replace function public.create_merge_ticket()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'invalid caller';
  end if;

  delete from public.merge_tickets where expires_at < now() - interval '7 days';
  insert into public.merge_tickets (from_uid) values (v_uid) returning id into v_id;
  return v_id;
end;
$$;

-- Called by the signed-in account with the ticket made while anonymous. Moves the anonymous
-- user's rows to the caller (the caller's existing rows win). Redeeming again is a no-op.
create or replace function public.redeem_merge_ticket(ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  t public.merge_tickets%rowtype;
  v_from_anonymous boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'invalid caller';
  end if;

  select * into t from public.merge_tickets mt where mt.id = ticket for update;
  if not found then
    raise exception 'invalid ticket';
  end if;
  if t.used_at is not null then
    if t.used_by = v_uid then
      return jsonb_build_object('status', 'already_redeemed');
    end if;
    raise exception 'invalid ticket';
  end if;
  if t.expires_at < now() then
    raise exception 'ticket expired';
  end if;
  if t.from_uid = v_uid then
    raise exception 'invalid ticket';
  end if;

  select u.is_anonymous into v_from_anonymous from auth.users u where u.id = t.from_uid;
  if not found or v_from_anonymous is not true then
    raise exception 'invalid ticket';
  end if;

  perform public._merge_user_rows(t.from_uid::text, v_uid::text);
  update public.merge_tickets set used_at = now(), used_by = v_uid where id = t.id;
  return jsonb_build_object('status', 'redeemed');
end;
$$;

revoke all on function public.claim_device_data(text) from public, anon;
revoke all on function public.create_merge_ticket() from public, anon;
revoke all on function public.redeem_merge_ticket(uuid) from public, anon;
grant execute on function public.claim_device_data(text) to authenticated;
grant execute on function public.create_merge_ticket() to authenticated;
grant execute on function public.redeem_merge_ticket(uuid) to authenticated;

-- Open policies (kept in Step A; replaced in Step B).
drop policy if exists "Public foods are readable by all" on public.foods;
create policy "Public foods are readable by all"
  on public.foods for select
  using (true);

drop policy if exists "Users can insert their own custom foods" on public.foods;
create policy "Users can insert their own custom foods"
  on public.foods for insert
  with check (true);

drop policy if exists "Users can update their own custom foods" on public.foods;
create policy "Users can update their own custom foods"
  on public.foods for update
  using (true);

drop policy if exists "Users can manage food logs" on public.food_logs;
create policy "Users can manage food logs"
  on public.food_logs for all
  using (true)
  with check (true);

drop policy if exists "Users can manage goals" on public.user_goals;
create policy "Users can manage goals"
  on public.user_goals for all
  using (true)
  with check (true);

drop policy if exists "Users can manage profile" on public.user_profile;
create policy "Users can manage profile"
  on public.user_profile for all
  using (true)
  with check (true);

drop policy if exists "Users can manage meal definitions" on public.meal_definitions;
create policy "Users can manage meal definitions"
  on public.meal_definitions for all
  using (true)
  with check (true);

drop policy if exists "Users can manage meal names" on public.meal_names;
create policy "Users can manage meal names"
  on public.meal_names for all
  using (true)
  with check (true);

-- ═════════════════════════════════════════════════════════
-- STEP B: run LATER, only after all your devices run the build with account support.
-- Replaces the open policies with per-user ones. Builds without auth will stop syncing.
-- ═════════════════════════════════════════════════════════
/*
drop policy if exists "Public foods are readable by all" on public.foods;
drop policy if exists "Users can insert their own custom foods" on public.foods;
drop policy if exists "Users can update their own custom foods" on public.foods;
drop policy if exists "Users can manage food logs" on public.food_logs;
drop policy if exists "Users can manage goals" on public.user_goals;
drop policy if exists "Users can manage profile" on public.user_profile;
drop policy if exists "Users can manage meal definitions" on public.meal_definitions;
drop policy if exists "Users can manage meal names" on public.meal_names;

drop policy if exists "foods: read public or own" on public.foods;
create policy "foods: read public or own"
  on public.foods for select to authenticated
  using (user_id is null or user_id = (select auth.uid())::text);

drop policy if exists "foods: insert own" on public.foods;
create policy "foods: insert own"
  on public.foods for insert to authenticated
  with check (user_id = (select auth.uid())::text);

drop policy if exists "foods: update own" on public.foods;
create policy "foods: update own"
  on public.foods for update to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists "foods: delete own" on public.foods;
create policy "foods: delete own"
  on public.foods for delete to authenticated
  using (user_id = (select auth.uid())::text);

drop policy if exists "food_logs: own rows" on public.food_logs;
create policy "food_logs: own rows"
  on public.food_logs for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists "user_goals: own rows" on public.user_goals;
create policy "user_goals: own rows"
  on public.user_goals for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists "user_profile: own rows" on public.user_profile;
create policy "user_profile: own rows"
  on public.user_profile for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists "meal_definitions: own rows" on public.meal_definitions;
create policy "meal_definitions: own rows"
  on public.meal_definitions for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists "meal_names: own rows" on public.meal_names;
create policy "meal_names: own rows"
  on public.meal_names for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);
*/
