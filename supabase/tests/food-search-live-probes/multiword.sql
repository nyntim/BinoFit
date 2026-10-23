-- Run this file alone after005. One authenticated RPC; synthetic identity rolls back.
-- On timeout/error issue ROLLBACK separately before another probe.
begin;
set local statement_timeout = '8s';
set local lock_timeout = '3s';
create temporary table food_search_probe_identity on commit drop as select gen_random_uuid() id;
insert into auth.users (id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id, 'authenticated', 'authenticated', true, '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb, now(), now() from pg_temp.food_search_probe_identity;
select set_config('request.jwt.claim.sub', id::text, true), set_config('request.jwt.claims', jsonb_build_object('sub', id::text, 'role', 'authenticated', 'is_anonymous', true)::text, true) from pg_temp.food_search_probe_identity;
set local role authenticated;
-- Actual execution time and count, without returning catalog names or personal data.
explain (analyze, buffers, format json)
select count(*) from public.search_foods(q => 'dragonfruit kombucha jelly', max_results => 20);
reset role;
rollback;
