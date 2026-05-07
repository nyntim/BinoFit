-- BinoFit Supabase Schema
-- Run this in the Supabase SQL editor to set up all tables and RLS policies.

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
  user_id        text,            -- null = public food; device UUID = custom food
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
-- Row Level Security
-- Currently permissive (anon key access). Tighten to
-- auth.uid() when real authentication is added.
-- ─────────────────────────────────────────────────────────
alter table public.foods         enable row level security;
alter table public.food_logs     enable row level security;
alter table public.user_goals    enable row level security;
alter table public.user_profile  enable row level security;

-- foods: everyone can read public foods; users can manage their own custom foods
create policy "Public foods are readable by all"
  on public.foods for select
  using (true);

create policy "Users can insert their own custom foods"
  on public.foods for insert
  with check (true);

create policy "Users can update their own custom foods"
  on public.foods for update
  using (true);

-- food_logs: open access until auth is wired up
create policy "Users can manage food logs"
  on public.food_logs for all
  using (true)
  with check (true);

-- user_goals: open access until auth is wired up
create policy "Users can manage goals"
  on public.user_goals for all
  using (true)
  with check (true);

-- user_profile: open access until auth is wired up
create policy "Users can manage profile"
  on public.user_profile for all
  using (true)
  with check (true);
