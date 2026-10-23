-- Safe on an isolated database or a deployed catalog: fixtures always roll back.
begin;
set local statement_timeout = '30s';
do $$ begin
  if exists (select 1 from auth.users where id in ('10700000-0000-4000-8000-000000000001', '10700000-0000-4000-8000-000000000002'))
    or exists (select 1 from public.foods where id like 'relevance-fixture-%') then
    raise exception 'Reserved relevance fixture identifiers already exist';
  end if;
end $$;
insert into auth.users (id, is_anonymous) values
  ('10700000-0000-4000-8000-000000000001', true), ('10700000-0000-4000-8000-000000000002', false);
insert into public.foods (id, name, brand, serving_units, calories, protein, carbs, fat, source, user_id) values
  ('relevance-fixture-repeated', 'fixture107 aaaaaa', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-peas', 'fixture107 Peas', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-green', 'fixture107 Green peas', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-peach', 'fixture107 Peach', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-peanut', 'fixture107 Peanut', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-chickpea', 'fixture107 Chickpea', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-apple', 'fixture107 Apple', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-breast', 'fixture107 Chicken breast', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-soup', 'fixture107 Chicken soup', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-yogurt', 'fixture107 Greek yogurt', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-dragon', 'fixture107 Dragonfruit', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-jelly', 'fixture107 Jelly', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-punct', 'fixture107 Crème, (7up). 2%_plain', 'Ben & Jerry''s', '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-own', 'fixture107 owner', null, '100g', 80, 5, 15, 1, 'custom', '10700000-0000-4000-8000-000000000001'),
  ('relevance-fixture-other', 'fixture107 owner', null, '100g', 80, 5, 15, 1, 'custom', '10700000-0000-4000-8000-000000000002');
insert into public.foods (id, name, brand, serving_units, calories, protein, carbs, fat, source, user_id)
select 'relevance-fixture-strong-' || n, 'fixture107 strongword breast ' || lpad(n::text, 2, '0'), null, '100g', 80, 5, 15, 1, 'open_food_facts', null from generate_series(1, 25) n;
insert into public.foods (id, name, brand, serving_units, calories, protein, carbs, fat, source, user_id) values
  ('relevance-fixture-doubletypo', 'fixture107 Chicken breast', null, '100g', 80, 5, 15, 1, 'open_food_facts', null),
  ('relevance-fixture-fuzzyfill', 'fixture107 strongwrd breast', null, '100g', 80, 5, 15, 1, 'open_food_facts', null);
insert into public.food_popularity (food_id, scans) values ('relevance-fixture-peanut', 2000000000);
select set_config('request.jwt.claim.sub', '10700000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.is_anonymous', 'true', true);
set local role authenticated;
do $$ declare ids text[]; begin
  select array_agg(id) into ids from public.search_foods('fixture107 pea');
  assert ids[1] = 'relevance-fixture-peas', 'plural outranks high popularity prefix';
  assert not ('relevance-fixture-chickpea' = any(ids)) and not ('relevance-fixture-apple' = any(ids)), 'mid-word gate';
  select array_agg(id) into ids from public.search_foods('fixture107 green pea');
  assert ids = array['relevance-fixture-green'], 'every word and plural';
  select array_agg(id) into ids from public.search_foods('fixture107 chiken breast');
  assert cardinality(ids) = 2 and 'relevance-fixture-breast' = any(ids) and 'relevance-fixture-doubletypo' = any(ids), 'typo must retain later-word coverage';
  assert (select count(*) from public.search_foods('fixture107 chiken breasx')) = 2, 'multiple long-token typos retain per-token fuzzy mode';
  assert (select count(*) from public.search_foods('fixture107 strongword breast', '{}', 20)) = 20, 'fast path fills requested20';
  assert (select count(*) from public.search_foods('fixture107 strongword breast', '{}', 50)) = 26, 'requested50 retains fuzzy fill beyond25 strong rows';
  assert (select id from public.search_foods('fixture107 strongword breast', '{}', 1)) = 'relevance-fixture-strong-1', 'fast-path stable ordering';
  assert not exists (select 1 from public.search_foods('fixture107 strongword breast', array['relevance-fixture-strong-1'], 20) where id = 'relevance-fixture-strong-1'), 'fast-path legacy exclusions';
  assert not exists (select 1 from public.search_foods('fixture107 dragonfruit smoothie')), 'missing second word';
  assert not exists (select 1 from public.search_foods('fixture107 dragonfruit kombucha jelly')), 'missing third word';
  assert exists (select 1 from public.search_foods('xaaaaa') where id = 'relevance-fixture-repeated'), 'one edit repeated-letter candidate survives indexed filter';
  assert not exists (select 1 from public.search_foods('qwzxv')), 'nonsense';
  assert exists (select 1 from public.search_foods('fixture107 greek yog') where id = 'relevance-fixture-yogurt'), 'final prefix';
  assert not exists (select 1 from public.search_foods('fixture107 gre yog')), 'earlier prefix rejected';
  assert exists (select 1 from public.search_foods('fixture107 ben & jerry''s') where id = 'relevance-fixture-punct'), 'punctuation and brand';
  assert exists (select 1 from public.search_foods('fixture107 creme 7up 2%_plain') where id = 'relevance-fixture-punct'), 'accent and punctuation literal separators';
  assert not exists (select 1 from public.search_foods('the of')), 'filler-only';
  assert not exists (select 1 from public.search_foods(repeat('a', 201))), 'length limit';
  assert not exists (select 1 from public.search_foods('one two three four five six seven eight nine ten eleven twelve thirteen')), 'token limit';
  assert not exists (select 1 from public.search_foods('fixture107 peas', array['relevance-fixture-peas']) where id = 'relevance-fixture-peas'), 'legacy exclusions';
  select array_agg(id) into ids from public.search_foods('fixture107 owner');
  assert ids = array['relevance-fixture-own'], 'own row visible, other owner excluded';
  assert (select count(*) from public.search_foods('fixture107 pea', '{}', 0)) = 1, 'limit lower clamp';
  assert not has_function_privilege('anon', 'public.search_foods(text,text[],integer)', 'EXECUTE'), 'no unauthenticated execution';
end $$;
do $$ begin
  assert not exists (select 1 from pg_catalog.pg_proc p, unnest(p.proconfig) setting where p.oid = 'public.search_foods(text,text[],integer)'::regprocedure and setting like 'pg_trgm.%'), 'cold backend must initialize GUC inside body';
  assert current_setting('pg_trgm.strict_word_similarity_threshold')::real = 0.25, 'transaction-local candidate threshold';
end $$;
-- Repeat as a normal account and verify both directions of isolation.
select set_config('request.jwt.claim.sub', '10700000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.is_anonymous', 'false', true);
do $$ begin
  assert (select array_agg(id) from public.search_foods('fixture107 owner')) = array['relevance-fixture-other'], 'normal account isolation';
end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin assert not exists (select 1 from public.search_foods('fixture107 pea')), 'missing identity rejected'; end $$;
reset role;
delete from auth.users where id = '10700000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub', '10700000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$ begin assert not exists (select 1 from public.search_foods('fixture107 pea')), 'deleted identity rejected'; end $$;
reset role;
rollback;
