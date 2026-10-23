-- Run the entire file in Supabase SQL Editor as postgres after migration 004.
-- All synthetic users/foods and temporary evidence roll back. No real account is used.
-- Each statement is bounded. On any error, run ROLLBACK before doing anything else.
-- The final evidence grid contains no production food names or user identifiers.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';
set local pg_trgm.strict_word_similarity_threshold = '0.25';
create temporary table food_search_live_evidence (
  check_name text primary key, evidence jsonb not null
) on commit drop;
create temporary table food_search_live_ids on commit drop as
select pg_catalog.gen_random_uuid() a, pg_catalog.gen_random_uuid() b,
       'searchlive' || replace(pg_catalog.gen_random_uuid()::text, '-', '') prefix;
select set_config('food_search_live.a', a::text, true),
       set_config('food_search_live.b', b::text, true),
       set_config('food_search_live.prefix', prefix, true)
from pg_temp.food_search_live_ids;

insert into pg_temp.food_search_live_evidence values
('versions', jsonb_build_object('postgres', version(), 'pg_trgm',
  (select extversion from pg_catalog.pg_extension where extname = 'pg_trgm')));
insert into pg_temp.food_search_live_evidence
select 'index:' || c.relname, jsonb_build_object('definition', pg_get_indexdef(c.oid),
  'valid', i.indisvalid, 'ready', i.indisready)
from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indexrelid
where i.indrelid = 'public.foods'::regclass
  and c.relname in ('idx_foods_search_fts', 'idx_foods_search_trgm');
insert into pg_temp.food_search_live_evidence
select 'rpc_definition', jsonb_build_object('signature', p.oid::regprocedure::text,
  'security_definer', p.prosecdef, 'stable', p.provolatile = 's',
  'settings', p.proconfig, 'authenticated_execute',
  has_function_privilege('authenticated', p.oid, 'EXECUTE'), 'anon_execute',
  has_function_privilege('anon', p.oid, 'EXECUTE'), 'definition', pg_get_functiondef(p.oid))
from pg_catalog.pg_proc p where p.oid = 'public.search_foods(text,text[],integer)'::regprocedure;
do $$ begin
  if (select count(*) from pg_temp.food_search_live_evidence where check_name like 'index:%'
      and (evidence->>'valid')::boolean and (evidence->>'ready')::boolean) <> 2 then
    raise exception 'Both search indexes must be valid and ready';
  end if;
  if not has_function_privilege('authenticated', 'public.search_foods(text,text[],integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.search_foods(text,text[],integer)', 'EXECUTE')
    or exists (select 1 from pg_catalog.pg_proc p,
      lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
      where p.oid = 'public.search_foods(text,text[],integer)'::regprocedure
        and acl.grantee = 0 and acl.privilege_type = 'EXECUTE') then
    raise exception 'Unexpected search RPC grants';
  end if;
end $$;

-- Only random synthetic rows are inserted, with no external auth request or email.
insert into auth.users (id, aud, role, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select a, 'authenticated', 'authenticated', true, '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb, now(), now()
from pg_temp.food_search_live_ids
union all
select b, 'authenticated', 'authenticated', false, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
from pg_temp.food_search_live_ids;
insert into public.foods (id, name, source, user_id)
select prefix || '-a', prefix || ' private food', 'custom', a::text from pg_temp.food_search_live_ids
union all
select prefix || '-b', prefix || ' private food', 'custom', b::text from pg_temp.food_search_live_ids;
select set_config('request.jwt.claim.sub', a::text, true),
       set_config('request.jwt.claims', jsonb_build_object('sub', a::text, 'role', 'authenticated', 'is_anonymous', true)::text, true)
from pg_temp.food_search_live_ids;
grant insert on pg_temp.food_search_live_evidence to authenticated;
set local role authenticated;
do $$ declare term text; n bigint; started timestamptz; own_id text; begin
  foreach term in array array['chicken breast', 'qwzxv', 'chiken breast', 'greek yog'] loop
    started := clock_timestamp();
    select count(*) into n from public.search_foods(q => term, max_results => 20);
    insert into pg_temp.food_search_live_evidence values ('rpc:' || term,
      jsonb_build_object('count', n, 'elapsed_ms', round(extract(epoch from clock_timestamp() - started) * 1000, 3)));
    if term = 'qwzxv' and n <> 0 then raise exception 'Nonsense returned matches'; end if;
  end loop;
  own_id := current_setting('food_search_live.prefix') || '-a';
  if (select array_agg(id) from public.search_foods(current_setting('food_search_live.prefix') || ' private'))
      is distinct from array[own_id] then raise exception 'Anonymous-session isolation failed'; end if;
  if exists (select 1 from public.search_foods(current_setting('food_search_live.prefix') || ' private', array[own_id], 20))
    then raise exception 'Legacy exclude_ids failed'; end if;
  insert into pg_temp.food_search_live_evidence values ('anonymous_session_and_legacy', '{"passed":true}');
end $$;
reset role;
select set_config('request.jwt.claim.sub', b::text, true),
       set_config('request.jwt.claims', jsonb_build_object('sub', b::text, 'role', 'authenticated', 'is_anonymous', false)::text, true)
from pg_temp.food_search_live_ids;
set local role authenticated;
do $$ begin
  if (select array_agg(id) from public.search_foods(current_setting('food_search_live.prefix') || ' private'))
    is distinct from array[current_setting('food_search_live.prefix') || '-b'] then
    raise exception 'Normal-account isolation failed'; end if;
  insert into pg_temp.food_search_live_evidence values ('normal_account_isolation', '{"passed":true}');
end $$;
reset role;

-- The RPC is SECURITY DEFINER. Explain its exact branch predicates as postgres,
-- with the same explicit public-or-own filter and threshold, without RLS overhead.
-- RPC-only EXPLAIN would conceal these branches behind a Function Scan.
-- Do not disable sequential scans: these are the planner's actual live choices.
do $$ declare label text; predicate text; plan jsonb; begin
  for label, predicate in select * from (values
    ('fts_common', $p$pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(f.name || ' ' || coalesce(f.brand, ''))) @@ pg_catalog.websearch_to_tsquery('simple'::pg_catalog.regconfig, 'chicken breast')$p$),
    ('fts_nonsense', $p$pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(f.name || ' ' || coalesce(f.brand, ''))) @@ pg_catalog.websearch_to_tsquery('simple'::pg_catalog.regconfig, 'qwzxv')$p$),
    ('prefix_common', $p$pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(f.name || ' ' || coalesce(f.brand, ''))) @@ pg_catalog.to_tsquery('simple'::pg_catalog.regconfig, '(chicken | chickens) & (bre | bres | bre:*)')$p$),
    ('trigram_typo', $p$(f.name || ' ' || coalesce(f.brand, '')) operator(extensions.%>>) 'chiken'$p$)
  ) branches(label, predicate) loop
    execute 'explain (analyze, buffers, format json) select count(*) from public.foods f where (f.user_id is null or f.user_id = auth.uid()::text) and ' || predicate into plan;
    insert into pg_temp.food_search_live_evidence values ('plan:' || label, plan);
  end loop;
end $$;

-- Missing and deleted identities cannot use even a previously authenticated role.
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.search_foods('chicken breast')) then raise exception 'Missing identity returned matches'; end if;
  insert into pg_temp.food_search_live_evidence values ('missing_identity', '{"passed":true}');
end $$;
reset role;
delete from auth.users where id = current_setting('food_search_live.a')::uuid;
select set_config('request.jwt.claim.sub', current_setting('food_search_live.a'), true),
  set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('food_search_live.a'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.search_foods('chicken breast')) then raise exception 'Deleted identity returned matches'; end if;
  insert into pg_temp.food_search_live_evidence values ('deleted_identity', '{"passed":true}');
end $$;
reset role;
-- Capture this grid. Verify idx_foods_search_fts and idx_foods_search_trgm appear
-- in their plans, inspect actual rows/buffers/time, and retain all RPC timings.
-- A sequential plan or timeout requires investigation before client release.
select check_name, evidence from pg_temp.food_search_live_evidence order by check_name;
rollback;
