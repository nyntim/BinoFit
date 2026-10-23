-- Run separately once per query below. No writes, identities or RPC calls.
-- Change ONLY probe_query to chicken breast / chicken bre / chiken breast /
-- dragonfruit kombucha jelly / qwzxv. Capture JSON actual rows, buffers and time.
-- This public-only probe compares pruning stages. Authenticated full RPC files
-- separately verify the real access guard and wall time; this is not a substitute.
begin;
set local statement_timeout = '8s';
select extensions.strict_word_similarity('bootstrap', 'bootstrap');
select set_config('pg_trgm.strict_word_similarity_threshold', '0.25', true);
select set_config('food_search.probe_query', 'chiken breast', true);
-- Build the006 single-scan AND of indexed per-token FTS OR trigram predicates.
-- The result grid contains plan/count information without food names or row IDs.
create temporary table food_search_candidate_plan (phase text, plan jsonb) on commit drop;
do $$
declare
  tokens text[] := string_to_array(public.food_search_normalize(current_setting('food_search.probe_query')), ' ');
  i integer; alternatives text; token_query tsquery; arm text; candidates text := '';
  strong_text text := ''; plan jsonb;
begin
  for i in 1..cardinality(tokens) loop
    alternatives := tokens[i] || ' | ' || public.food_search_singular(tokens[i]) || ' | ' || tokens[i] || 's';
    if i = cardinality(tokens) then alternatives := alternatives || ' | ' || tokens[i] || ':*'; end if;
    strong_text := strong_text || case when i > 1 then ' & ' else '' end || '(' || alternatives || ')';
    token_query := pg_catalog.to_tsquery('simple'::pg_catalog.regconfig, '(' || alternatives || ')');
    arm := format('pg_catalog.to_tsvector(''simple''::pg_catalog.regconfig, public.food_search_normalize(f.name || '' '' || coalesce(f.brand, ''''))) @@ %L::tsquery', token_query);
    if length(tokens[i]) >= 6 then
      arm := arm || format(' or (f.name || '' '' || coalesce(f.brand, '''')) operator(extensions.%%>>) %L', tokens[i]);
    end if;
    candidates := candidates || case when i > 1 then ' and ' else '' end || '(' || arm || ')';
  end loop;
  execute format('explain (analyze, buffers, format json) with scored as materialized (select public.food_search_quality(f.name, f.brand, %L::text[]) quality from public.foods f where f.user_id is null and pg_catalog.to_tsvector(''simple''::pg_catalog.regconfig, public.food_search_normalize(f.name || '' '' || coalesce(f.brand, ''''))) @@ %L::tsquery) select count(*) from scored where quality is not null and quality[2] <= 2', tokens, pg_catalog.to_tsquery('simple'::pg_catalog.regconfig, strong_text)) into plan;
  insert into pg_temp.food_search_candidate_plan values ('strong_candidates_and_quality', plan);
  execute 'explain (analyze, buffers, format json) with scored as materialized (select public.food_search_quality(f.name, f.brand, $1::text[]) quality from public.foods f where f.user_id is null and ' || candidates || ') select count(*) from scored where quality is not null' into plan using tokens;
  insert into pg_temp.food_search_candidate_plan values ('bitmap_candidates_and_quality', plan);
end $$;
select phase, plan from pg_temp.food_search_candidate_plan order by phase;
rollback;
