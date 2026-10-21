-- Issue 99 prerequisite for the intended BinoFit project only.
-- Canonical definitions: supabase/schema.sql, routines and routine_exercises.
-- Preflight confirmed both tables absent. Do not execute the full historical schema.
-- Run this file immediately before 202610210001_account_deletion.sql inside
-- ONE caller-owned transaction, then commit only if both files succeed.
-- No transaction statements here, allowing the deployment runner to own atomicity.
-- Reruns preserve rows and recreate only these two named owner policies.

create table if not exists public.routines (
  id         text primary key,
  user_id    text not null,
  name       text not null,
  position   integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);
create index if not exists idx_routines_user on public.routines (user_id);

create table if not exists public.routine_exercises (
  id           text primary key,
  user_id      text not null,
  routine_id   text not null,
  exercise_id  text not null,
  position     integer not null,
  set_count    integer not null,
  rest_seconds integer,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  deleted_at   timestamptz
);
create index if not exists idx_routine_exercises_user
  on public.routine_exercises (user_id);

-- No foreign keys: canonical sync permits child rows to arrive before parents.
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;

-- Supabase defaults may grant broad table privileges. Anonymous auth sessions use
-- the authenticated database role; the unauthenticated anon role needs no access.
revoke all privileges on table public.routines, public.routine_exercises
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.routines, public.routine_exercises to authenticated;
grant select, insert, update, delete
  on table public.routines, public.routine_exercises to service_role;

drop policy if exists "routines: own rows" on public.routines;
create policy "routines: own rows"
  on public.routines for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

drop policy if exists "routine_exercises: own rows" on public.routine_exercises;
create policy "routine_exercises: own rows"
  on public.routine_exercises for all to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

-- The following deletion migration adds restrictive live_account_required
-- policies to both tables, plus the deletion RPC and its recovery receipts.
-- Existing shared schema grants are unchanged. No sequence grants are needed:
-- client-generated text ids avoid sequences. No rows are inserted or rewritten.
-- After both files succeed, notify the API schema cache in the same transaction.
notify pgrst, 'reload schema';
