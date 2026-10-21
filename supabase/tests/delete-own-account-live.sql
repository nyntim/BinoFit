\set ON_ERROR_STOP on
-- Run only through the verified qaxeirbqyrmakwuwvpto connection as database owner.
-- Creates random disposable fixtures only. Every change, including test trigger, rolls back.
-- Requires the reviewed routine-table prerequisite and account-deletion migration first.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create temporary table issue99_fixture_ids on commit drop as
select gen_random_uuid() as a, gen_random_uuid() as b, gen_random_uuid() as anonymous,
       'issue99-fixture-' || gen_random_uuid()::text as prefix;
select a as fixture_a, b as fixture_b, anonymous as fixture_anonymous, prefix as fixture_prefix
from pg_temp.issue99_fixture_ids \gset
select set_config('issue99.fixture_a', a::text, true),
       set_config('issue99.fixture_b', b::text, true),
       set_config('issue99.fixture_prefix', prefix, true)
from pg_temp.issue99_fixture_ids;

-- Fail before seeding if a required deployed table or RPC is missing.
do $$ declare t text; begin
  foreach t in array array['foods','food_logs','user_goals','user_profile','meal_definitions','meal_names','weight_entries','exercises','workouts','workout_exercises','workout_sets','routines','routine_exercises','device_claims','merge_tickets','account_deletion_receipts'] loop
    if to_regclass('public.' || t) is null then raise exception 'Missing prerequisite table: %', t; end if;
  end loop;
  if to_regprocedure('public.delete_own_account()') is null then raise exception 'Deletion RPC not deployed'; end if;
end $$;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, is_anonymous, created_at, updated_at)
select a, 'authenticated', 'authenticated', prefix || '-a@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, now(), now() from pg_temp.issue99_fixture_ids
union all
select b, 'authenticated', 'authenticated', prefix || '-b@example.invalid', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, now(), now() from pg_temp.issue99_fixture_ids
union all
select anonymous, 'authenticated', 'authenticated', null, '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb, true, now(), now() from pg_temp.issue99_fixture_ids;
insert into auth.sessions (id, user_id, created_at, updated_at)
select gen_random_uuid(), owner, now(), now() from pg_temp.issue99_fixture_ids cross join lateral (values (a), (b)) owners(owner);
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select owner::text, owner, jsonb_build_object('sub', owner::text), 'email', now(), now()
from pg_temp.issue99_fixture_ids cross join lateral (values (a), (b)) owners(owner);

-- Real deployed NOT NULL columns and tree relationships are populated explicitly.
do $$ declare owner uuid; key text; begin
  foreach owner in array array[current_setting('issue99.fixture_a')::uuid, current_setting('issue99.fixture_b')::uuid] loop
    key := current_setting('issue99.fixture_prefix') || '-' || owner::text;
    insert into public.foods (id, user_id, name, source) values (key || '-food', owner::text, 'Deletion regression fixture', 'custom');
    insert into public.food_logs (id, user_id, date, meal_slot, food_id, serving_amount, serving_unit) values (key || '-log', owner::text, '2026-10-21', key || '-meal', key || '-food', 1, 'g');
    insert into public.user_goals (user_id, calorie_goal) values (owner::text, 2000);
    insert into public.user_profile (user_id, weight) values (owner::text, 70);
    insert into public.meal_definitions (user_id, id, position) values (owner::text, key || '-meal', 0);
    insert into public.meal_names (user_id, meal_id, name, effective_from) values (owner::text, key || '-meal', 'Fixture meal', '2026-10-21');
    insert into public.weight_entries (id, user_id, date, weight_kg) values (key || '-weight', owner::text, '2026-10-21', 70);
    insert into public.exercises (id, user_id, name, log_type, equipment) values (key || '-exercise', owner::text, 'Fixture exercise', 'weight_reps', 'barbell');
    insert into public.routines (id, user_id, name, position) values (key || '-routine', owner::text, 'Fixture routine', 0);
    insert into public.routine_exercises (id, user_id, routine_id, exercise_id, position, set_count) values (key || '-routine-exercise', owner::text, key || '-routine', key || '-exercise', 0, 1);
    insert into public.workouts (id, user_id, date, routine_id) values (key || '-workout', owner::text, '2026-10-21', key || '-routine');
    insert into public.workout_exercises (id, user_id, workout_id, exercise_id, position) values (key || '-workout-exercise', owner::text, key || '-workout', key || '-exercise', 0);
    insert into public.workout_sets (id, user_id, workout_id, workout_exercise_id, position) values (key || '-set', owner::text, key || '-workout', key || '-workout-exercise', 0);
    insert into public.device_claims (device_id, user_id) values (key || '-device', owner);
  end loop;
end $$;
insert into public.foods (id, name, source) select prefix || '-shared', 'Shared deletion regression fixture', 'usda' from pg_temp.issue99_fixture_ids;
insert into public.merge_tickets (from_uid, used_by) select a, b from pg_temp.issue99_fixture_ids union all select b, a from pg_temp.issue99_fixture_ids;

select set_config('request.jwt.claim.sub', a::text, true),
       set_config('request.jwt.claims', jsonb_build_object('sub', a::text, 'role', 'authenticated', 'is_anonymous', false)::text, true)
from pg_temp.issue99_fixture_ids;

-- The trigger can only reject fixture A's weight deletion. It never changes real rows.
create function pg_temp.issue99_reject_fixture_delete() returns trigger language plpgsql as $$
begin
  if old.user_id = current_setting('issue99.fixture_a') then raise exception 'issue99 injected fixture failure'; end if;
  return old;
end $$;
create trigger issue99_fixture_deletion_failure before delete on public.weight_entries for each row execute function pg_temp.issue99_reject_fixture_delete();
set local role authenticated;
do $$ begin
  if public.account_deletion_capability() <> 1 then raise exception 'Live account capability missing'; end if;
  begin perform public.delete_own_account(); raise exception 'Expected injected failure';
  exception when raise_exception then if sqlerrm <> 'issue99 injected fixture failure' then raise; end if; end;
  if public.account_deletion_status() then raise exception 'Failed transaction produced completion receipt'; end if;
end $$;
reset role;
do $$ declare t text; n bigint; begin
  foreach t in array array['foods','food_logs','user_goals','user_profile','meal_definitions','meal_names','weight_entries','exercises','workouts','workout_exercises','workout_sets','routines','routine_exercises'] loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using current_setting('issue99.fixture_a');
    if n <> 1 then raise exception 'Failure did not restore fixture A rows in %', t; end if;
  end loop;
  if not exists(select 1 from auth.users where id = current_setting('issue99.fixture_a')::uuid) then raise exception 'Failure removed fixture auth user'; end if;
  raise notice 'PASS: injected failure rolls back every owned table and auth user';
end $$;
drop trigger issue99_fixture_deletion_failure on public.weight_entries;
set local role authenticated;
select public.delete_own_account();

-- Reuse the same simulated signed claims after deleting its identity.
do $$ begin
  if public.account_deletion_capability() <> 0 then raise exception 'Deleted identity retains capability'; end if;
  if exists(select 1 from public.food_logs where user_id = current_setting('issue99.fixture_a')) then raise exception 'Stale JWT reads owned data'; end if;
  begin
    insert into public.food_logs (id, user_id, date, meal_slot, food_id, serving_amount, serving_unit)
    values (current_setting('issue99.fixture_prefix') || '-resurrection', current_setting('issue99.fixture_a'), '2026-10-21', 'fixture', 'fixture', 1, 'g');
    raise exception 'Stale JWT recreated owned data';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_own_account(); raise exception 'Repeated destructive RPC accepted deleted identity';
  exception when insufficient_privilege then null; end;
  if not public.account_deletion_status() then raise exception 'Missing recovery receipt'; end if;
  begin perform 1 from public.account_deletion_receipts; raise exception 'Direct receipt access allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS: stale JWT cannot recreate data; protected recovery receipt works';
end $$;
reset role;
do $$ declare t text; n bigint; begin
  foreach t in array array['foods','food_logs','user_goals','user_profile','meal_definitions','meal_names','weight_entries','exercises','workouts','workout_exercises','workout_sets','routines','routine_exercises'] loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using current_setting('issue99.fixture_a');
    if n <> 0 then raise exception 'Owned fixture A rows remain in %', t; end if;
    execute format('select count(*) from public.%I where user_id = $1', t) into n using current_setting('issue99.fixture_b');
    if n <> 1 then raise exception 'Other fixture account changed in %', t; end if;
  end loop;
  if not exists(select 1 from public.foods where id = current_setting('issue99.fixture_prefix') || '-shared' and user_id is null) then raise exception 'Shared fixture food removed'; end if;
  if exists(select 1 from auth.users where id = current_setting('issue99.fixture_a')::uuid) or exists(select 1 from auth.sessions where user_id = current_setting('issue99.fixture_a')::uuid) or exists(select 1 from auth.identities where user_id = current_setting('issue99.fixture_a')::uuid) then raise exception 'Auth user/session/identity cleanup incomplete'; end if;
  if not exists(select 1 from auth.users where id = current_setting('issue99.fixture_b')::uuid) or not exists(select 1 from auth.sessions where user_id = current_setting('issue99.fixture_b')::uuid) or not exists(select 1 from auth.identities where user_id = current_setting('issue99.fixture_b')::uuid) then raise exception 'Other fixture auth data changed'; end if;
  if exists(select 1 from public.device_claims where user_id = current_setting('issue99.fixture_a')::uuid) or exists(select 1 from public.merge_tickets where from_uid = current_setting('issue99.fixture_a')::uuid or used_by = current_setting('issue99.fixture_a')::uuid) then raise exception 'Fixture merge references remain'; end if;
  raise notice 'PASS: complete owned deletion, auth cascade, other fixture and shared food preserved';
end $$;

select set_config('request.jwt.claim.sub', b::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', b::text, 'role', 'authenticated', 'is_anonymous', false)::text, true) from pg_temp.issue99_fixture_ids;
set local role authenticated;
do $$ begin
  if public.account_deletion_status() then raise exception 'Other account can see deleted account receipt'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', anonymous::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', anonymous::text, 'role', 'authenticated', 'is_anonymous', true)::text, true) from pg_temp.issue99_fixture_ids;
set local role authenticated;
do $$ begin
  begin perform public.delete_own_account(); raise exception 'Anonymous fixture accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin
  begin perform public.delete_own_account(); raise exception 'Unauthenticated caller accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin raise notice 'PASS: anonymous, unauthenticated and cross-account receipt checks'; end $$;
rollback;

-- Check rollback removed only test fixtures. Do not query or modify any actual account.
select exists(select 1 from auth.users where id in (:'fixture_a'::uuid, :'fixture_b'::uuid, :'fixture_anonymous'::uuid))
    or exists(select 1 from public.foods where id like :'fixture_prefix' || '%')
    or exists(select 1 from public.account_deletion_receipts where user_id = :'fixture_a'::uuid) as fixture_residue \gset
\if :fixture_residue
  \echo 'FAIL: fixture residue after rollback'
  \quit 1
\else
  \echo 'PASS: transaction rolled back; no fixture users, foods or receipts remain'
\endif
