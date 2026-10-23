-- Additive catalog search deployment. Apply before the new client.

create or replace function public.food_search_normalize(value text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.normalize(coalesce(value, ''), 'NFD'), U&'[\0300-\036f]', '', 'g')), '[^[:alnum:]]+', ' ', 'g'));
$$;

create index if not exists idx_foods_search_fts on public.foods using gin
  (pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(name || ' ' || coalesce(brand, ''))));

create or replace function public.food_search_one_edit(a text, b text)
returns boolean language plpgsql immutable parallel safe set search_path = '' as $$
declare i integer := 1; j integer := 1; edits integer := 0;
begin
  if abs(length(a) - length(b)) > 1 then return false; end if;
  while i <= length(a) and j <= length(b) loop
    if substr(a, i, 1) = substr(b, j, 1) then i := i + 1; j := j + 1;
    else
      edits := edits + 1;
      if edits > 1 then return false; end if;
      if length(a) >= length(b) then i := i + 1; end if;
      if length(b) >= length(a) then j := j + 1; end if;
    end if;
  end loop;
  return edits + case when i <= length(a) or j <= length(b) then 1 else 0 end <= 1;
end;
$$;
create or replace function public.food_search_singular(word text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select case when length(word) >= 4 and right(word, 1) = 's' and word !~ '(ss|us|is)$' then left(word, -1) else word end;
$$;

-- NULL rejects the row. Score components keep word coverage separate from popularity.
create or replace function public.food_search_quality(food_name text, food_brand text, tokens text[])
returns integer[] language plpgsql immutable parallel safe set search_path = '' as $$
declare words text[] := string_to_array(public.food_search_normalize(food_name || ' ' || coalesce(food_brand, '')), ' ');
  name_words integer := cardinality(string_to_array(public.food_search_normalize(food_name), ' '));
  i integer; j integer; quality integer; best integer; position integer;
  worst integer := 0; total integer := 0; proximity integer := 0; brands integer := 0; previous integer;
begin
  if coalesce(cardinality(tokens), 0) = 0 then return null; end if;
  for i in 1..cardinality(tokens) loop
    best := 4; position := 0;
    for j in 1..cardinality(words) loop
      quality := case
        when tokens[i] = words[j] then 0
        when public.food_search_singular(tokens[i]) = public.food_search_singular(words[j]) then 1
        when i = cardinality(tokens) and starts_with(words[j], tokens[i]) then 2
        when length(tokens[i]) >= 6 and length(words[j]) >= 5 and public.food_search_one_edit(tokens[i], words[j]) then 3
        else 4 end;
      if quality < best then best := quality; position := j; end if;
    end loop;
    if best = 4 then return null; end if;
    worst := greatest(worst, best); total := total + best;
    if previous is not null then proximity := proximity + abs(position - previous - 1); end if;
    previous := position;
    if position > name_words then brands := brands + 1; end if;
  end loop;
  return array[case when public.food_search_normalize(food_name) = array_to_string(tokens, ' ') then 0 else 1 end, worst, total, proximity, brands];
end;
$$;

-- Load pg_trgm in this deployment session before validating the function SET.
-- Otherwise its not-yet-registered custom GUC can require superuser privileges.
select extensions.strict_word_similarity('bootstrap', 'bootstrap');

create or replace function public.search_foods(q text, exclude_ids text[] default '{}', max_results integer default 20)
returns table (id text, name text, brand text, serving_units text, calories real, protein real, carbs real, fat real, source text)
language plpgsql stable security definer set search_path = ''
-- A 0.45 candidate cutoff loses valid one-edit repeated-letter words (xaaaaa/aaaaaa).
set pg_trgm.strict_word_similarity_threshold = '0.25'
as $$
declare phrase text := public.food_search_normalize(q); tokens text[]; raw_tokens text[];
  i integer; exact_query tsquery; prefix_query tsquery; prefix_text text; token text; alternatives text;
begin
  if auth.uid() is null or not public.has_live_account() or length(coalesce(q, '')) > 200 then return; end if;
  raw_tokens := string_to_array(phrase, ' ');
  if cardinality(raw_tokens) > 12 then return; end if;
  select array_agg(word order by first_position) into tokens from (
    select word, min(position) first_position from unnest(raw_tokens) with ordinality as t(word, position)
    where word <> '' and word <> all(array['a','an','the','of','with','and','for','in','on','at','by','to']) group by word
  ) unique_words;
  if coalesce(cardinality(tokens), 0) = 0 then return; end if;
  exact_query := pg_catalog.websearch_to_tsquery('simple'::pg_catalog.regconfig, array_to_string(tokens, ' '));
  -- Tokens contain only letters/numbers. No user query operators reach to_tsquery.
  prefix_text := '';
  for i in 1..cardinality(tokens) loop
    token := tokens[i];
    alternatives := token || ' | ' || public.food_search_singular(token) || ' | ' || token || 's';
    if i = cardinality(tokens) then alternatives := alternatives || ' | ' || token || ':*'; end if;
    prefix_text := prefix_text || case when i > 1 then ' & ' else '' end || '(' || alternatives || ')';
  end loop;
  prefix_query := pg_catalog.to_tsquery('simple'::pg_catalog.regconfig, prefix_text);
  return query
  with candidates as (
    select f.id from public.foods f
    where (f.user_id is null or f.user_id = auth.uid()::text)
      and pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(f.name || ' ' || coalesce(f.brand, ''))) @@ exact_query
    union
    select f.id from public.foods f
    where (f.user_id is null or f.user_id = auth.uid()::text)
      and pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(f.name || ' ' || coalesce(f.brand, ''))) @@ prefix_query
    union
    select f.id from unnest(tokens) as query_token
    cross join lateral (
      select candidate.id from public.foods candidate
      where (candidate.user_id is null or candidate.user_id = auth.uid()::text)
        and length(query_token) >= 6
        and (candidate.name || ' ' || coalesce(candidate.brand, '')) operator(extensions.%>>) query_token
    ) f
  ), accepted as (
    select f.*, public.food_search_quality(f.name, f.brand, tokens) quality
    from candidates c join public.foods f on f.id = c.id
    where (f.user_id is null or f.user_id = auth.uid()::text)
      and not (f.id = any(coalesce(exclude_ids, '{}'::text[])))
  )
  select f.id, f.name, f.brand, f.serving_units, f.calories, f.protein, f.carbs, f.fat, f.source
  from accepted f left join public.food_popularity popularity on popularity.food_id = f.id
  where f.quality is not null
  order by f.quality,
    least(pg_catalog.ts_rank_cd(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(f.name || ' ' || coalesce(f.brand, ''))), exact_query), 1) desc,
    least(ln(1 + greatest(coalesce(popularity.scans, 0), 0)), 2) desc,
    length(f.name), f.id
  limit least(greatest(coalesce(max_results, 20), 1), 50);
end;
$$;

revoke all on function public.search_foods(text, text[], integer) from public, anon;
grant execute on function public.search_foods(text, text[], integer) to authenticated;
revoke all on function public.food_search_normalize(text), public.food_search_one_edit(text, text), public.food_search_singular(text), public.food_search_quality(text, text, text[]) from public, anon;
-- The index expression requires normalize for authenticated reads/writes. Helpers are invokers.
grant execute on function public.food_search_normalize(text), public.food_search_one_edit(text, text), public.food_search_singular(text), public.food_search_quality(text, text, text[]) to authenticated;
