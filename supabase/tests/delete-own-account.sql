-- Run after disposable bootstrap, then the production migration, as database owner.
begin;
insert into auth.users values ('00000000-0000-0000-0000-000000000001', false), ('00000000-0000-0000-0000-000000000002', false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.is_anonymous', 'false', true);
do $$ declare t text; begin
  foreach t in array array['foods','food_logs','user_goals','user_profile','meal_definitions','meal_names','weight_entries','exercises','workouts','workout_exercises','workout_sets','routines','routine_exercises'] loop
    execute format('insert into public.%I (id, user_id) values ($1, $2), ($3, $4)', t) using 'a', '00000000-0000-0000-0000-000000000001', 'b', '00000000-0000-0000-0000-000000000002';
  end loop;
end $$;
insert into public.foods values ('shared', null);
insert into public.device_claims values ('a', '00000000-0000-0000-0000-000000000001');
insert into public.merge_tickets values (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
-- Inject a mid-transaction error. The complete operation must roll back.
create function public.test_reject_delete() returns trigger language plpgsql as $$ begin raise exception 'injected'; end; $$;
create trigger reject_delete before delete on public.weight_entries for each row execute function public.test_reject_delete();
do $$ begin
  begin perform public.delete_own_account(); raise exception 'expected failure';
  exception when raise_exception then if sqlerrm <> 'injected' then raise; end if; end;
  if not exists(select 1 from public.food_logs where id = 'a') or not exists(select 1 from auth.users where id = auth.uid()) then raise exception 'partial deletion'; end if;
end $$;
drop trigger reject_delete on public.weight_entries;
set local role authenticated;
select public.delete_own_account();
-- Surviving signed JWT must fail reads/writes, despite retaining auth.uid().
do $$ begin
  if exists(select 1 from public.food_logs) then raise exception 'deleted JWT can read'; end if;
  begin insert into public.food_logs values ('resurrection', auth.uid()::text); raise exception 'write allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.delete_own_account(); raise exception 'repeat destructive RPC allowed';
  exception when insufficient_privilege then null; end;
  if not public.account_deletion_status() then raise exception 'missing completion receipt'; end if;
end $$;
reset role;
do $$ declare t text; n integer; begin
  foreach t in array array['foods','food_logs','user_goals','user_profile','meal_definitions','meal_names','weight_entries','exercises','workouts','workout_exercises','workout_sets','routines','routine_exercises'] loop
    execute format('select count(*) from public.%I where user_id = $1', t) into n using '00000000-0000-0000-0000-000000000001';
    if n <> 0 then raise exception 'owned rows remain in %', t; end if;
    execute format('select count(*) from public.%I where id = $1', t) into n using 'b';
    if n <> 1 then raise exception 'other user changed in %', t; end if;
  end loop;
  if not exists(select 1 from public.foods where id = 'shared') then raise exception 'shared food removed'; end if;
  if exists(select 1 from public.device_claims) or exists(select 1 from public.merge_tickets) then raise exception 'merge references remain'; end if;
  if exists(select 1 from auth.users where id = auth.uid()) then raise exception 'auth user remains'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.is_anonymous', 'true', true);
set local role authenticated;
do $$ begin
  begin perform public.delete_own_account(); raise exception 'anonymous accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.delete_own_account(); raise exception 'unauthenticated accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
