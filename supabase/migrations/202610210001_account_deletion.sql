-- Minimal completion receipts support recovery after a committed response is lost.
create table if not exists public.account_deletion_receipts (
  user_id uuid primary key,
  deleted_at timestamptz not null default now()
);
alter table public.account_deletion_receipts enable row level security;
revoke all on public.account_deletion_receipts from public, anon, authenticated;

create or replace function public.has_live_account()
returns boolean language sql volatile security definer set search_path = ''
as $$ select exists (select 1 from auth.users where id = auth.uid() for key share); $$;
revoke all on function public.has_live_account() from public, anon;
grant execute on function public.has_live_account() to authenticated;

-- A deleted user's still-valid JWT cannot read or recreate owned rows.
drop policy if exists live_account_required on public.foods;
create policy live_account_required on public.foods as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.food_logs;
create policy live_account_required on public.food_logs as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.user_goals;
create policy live_account_required on public.user_goals as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.user_profile;
create policy live_account_required on public.user_profile as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.meal_definitions;
create policy live_account_required on public.meal_definitions as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.meal_names;
create policy live_account_required on public.meal_names as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.weight_entries;
create policy live_account_required on public.weight_entries as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.exercises;
create policy live_account_required on public.exercises as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.workouts;
create policy live_account_required on public.workouts as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.workout_exercises;
create policy live_account_required on public.workout_exercises as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.workout_sets;
create policy live_account_required on public.workout_sets as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.routines;
create policy live_account_required on public.routines as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());
drop policy if exists live_account_required on public.routine_exercises;
create policy live_account_required on public.routine_exercises as restrictive for all to authenticated using (public.has_live_account()) with check (public.has_live_account());

create or replace function public.account_deletion_status()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.account_deletion_receipts where user_id = auth.uid()); $$;
revoke all on function public.account_deletion_status() from public, anon;
grant execute on function public.account_deletion_status() to authenticated;

-- Atomic, caller-owned deletion. No caller-supplied user identifier or client admin key.
create or replace function public.account_deletion_capability()
returns integer language sql volatile security invoker set search_path = ''
as $$ select case when public.has_live_account() then 1 else 0 end; $$;
revoke all on function public.account_deletion_capability() from public, anon;
grant execute on function public.account_deletion_capability() to authenticated;

create or replace function public.delete_own_account()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, true) then
    raise exception 'A signed-in account is required' using errcode = '42501';
  end if;
  -- Serialize duplicate requests for this account. A lost response can be retried
  -- using its existing JWT; every statement is idempotent.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text, 0));
  -- Existing writes hold KEY SHARE through their live-account policy. Wait for
  -- those statements before removing rows; later writes wait, then see no user.
  perform id from auth.users where id = caller for update;
  if not found then
    raise exception 'Account no longer exists' using errcode = '42501';
  end if;
  delete from public.workout_sets where user_id = caller::text;
  delete from public.workout_exercises where user_id = caller::text;
  delete from public.routine_exercises where user_id = caller::text;
  delete from public.workouts where user_id = caller::text;
  delete from public.routines where user_id = caller::text;
  delete from public.exercises where user_id = caller::text;
  delete from public.food_logs where user_id = caller::text;
  delete from public.foods where user_id = caller::text;
  delete from public.weight_entries where user_id = caller::text;
  delete from public.meal_names where user_id = caller::text;
  delete from public.meal_definitions where user_id = caller::text;
  delete from public.user_goals where user_id = caller::text;
  delete from public.user_profile where user_id = caller::text;
  delete from public.merge_tickets where from_uid = caller or used_by = caller;
  delete from public.device_claims where user_id = caller;
  insert into public.account_deletion_receipts(user_id) values (caller) on conflict (user_id) do nothing;
  delete from auth.users where id = caller;
  return true;
end;
$$;
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
