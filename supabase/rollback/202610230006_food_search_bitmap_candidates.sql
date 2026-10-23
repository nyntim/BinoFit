-- Emergency rollback to005 RPC only. Its fuzzy search remains slow.
-- Performance replacement for deployed004. No catalog/index/user-data changes.
create or replace function public.search_foods(q text, exclude_ids text[] default '{}', max_results integer default 20)
returns table (id text, name text, brand text, serving_units text, calories real, protein real, carbs real, fat real, source text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  phrase text := public.food_search_normalize(q); tokens text[]; raw_tokens text[];
  i integer; exact_query tsquery; prefix_query tsquery; prefix_text text := '';
  token text; alternatives text; token_queries tsquery[] := '{}';
  requested_limit integer := least(greatest(coalesce(max_results, 20), 1), 50);
  caller_id text := auth.uid()::text;
  strong_ids text[]; candidate_sql text := ''; arm text; statement text;
begin
  if caller_id is null or not public.has_live_account() or length(coalesce(q, '')) > 200 then return; end if;
  -- Every backend must register pg_trgm's GUC before setting it. SET LOCAL is
  -- transaction-scoped, including PostgREST read-only RPC transactions.
  perform extensions.strict_word_similarity('bootstrap', 'bootstrap');
  perform pg_catalog.set_config('pg_trgm.strict_word_similarity_threshold', '0.25', true);
  raw_tokens := string_to_array(phrase, ' ');
  if cardinality(raw_tokens) > 12 then return; end if;
  select array_agg(word order by first_position) into tokens from (
    select word, min(position) first_position from unnest(raw_tokens) with ordinality as t(word, position)
    where word <> '' and word <> all(array['a','an','the','of','with','and','for','in','on','at','by','to']) group by word
  ) unique_words;
  if coalesce(cardinality(tokens), 0) = 0 then return; end if;
  exact_query := pg_catalog.websearch_to_tsquery('simple'::pg_catalog.regconfig, array_to_string(tokens, ' '));
  -- Normalized tokens contain letters/numbers only. Raw user query syntax is never SQL.
  for i in 1..cardinality(tokens) loop
    token := tokens[i];
    alternatives := token || ' | ' || public.food_search_singular(token) || ' | ' || token || 's';
    if i = cardinality(tokens) then alternatives := alternatives || ' | ' || token || ':*'; end if;
    token_queries := array_append(token_queries, pg_catalog.to_tsquery('simple'::pg_catalog.regconfig, '(' || alternatives || ')'));
    prefix_text := prefix_text || case when i > 1 then ' & ' else '' end || '(' || alternatives || ')';
  end loop;
  prefix_query := pg_catalog.to_tsquery('simple'::pg_catalog.regconfig, prefix_text);

  -- All legal exact/plural/prefix rows are ahead of every typo row. If they fill
  -- the caller's requested limit, fuzzy retrieval cannot change the returned top N.
  with scored as materialized (
    select f.*, public.food_search_quality(f.name, f.brand, tokens) quality
    from public.foods f
    where (f.user_id is null or f.user_id = caller_id)
      and not (f.id = any(coalesce(exclude_ids, '{}'::text[])))
      and pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(f.name || ' ' || coalesce(f.brand, ''))) @@ prefix_query
  ), winners as (
    select f.id from scored f left join public.food_popularity popularity on popularity.food_id = f.id
    where f.quality is not null and f.quality[2] <= 2
    order by f.quality,
      least(pg_catalog.ts_rank_cd(pg_catalog.to_tsvector('simple'::pg_catalog.regconfig, public.food_search_normalize(f.name || ' ' || coalesce(f.brand, ''))), exact_query), 1) desc,
      least(ln(1 + greatest(coalesce(popularity.scans, 0), 0)), 2) desc,
      length(f.name), f.id
    limit requested_limit
  )
  select array_agg(w.id) into strong_ids from winners w;

  if coalesce(cardinality(strong_ids), 0) = requested_limit then
    return query
    select f.id, f.name, f.brand, f.serving_units, f.calories, f.protein, f.carbs, f.fat, f.source
    from unnest(strong_ids) with ordinality as winner(food_id, position)
    join public.foods f on f.id = winner.food_id
    where (f.user_id is null or f.user_id = caller_id)
    order by winner.position;
    return;
  end if;

  -- Intersect one safe candidate superset per significant word. Each long word
  -- keeps BOTH its strong FTS modes and indexed typo mode. No first-N cap exists.
  for i in 1..cardinality(tokens) loop
    arm := pg_catalog.format(
      'select f.id from public.foods f
       where (f.user_id is null or f.user_id = $1)
         and not (f.id = any($2::text[]))
         and pg_catalog.to_tsvector(''simple''::pg_catalog.regconfig, public.food_search_normalize(f.name || '' '' || coalesce(f.brand, ''''))) @@ ($4::tsquery[])[%s]', i);
    if length(tokens[i]) >= 6 then
      arm := arm || pg_catalog.format(
        ' union select f.id from public.foods f
          where (f.user_id is null or f.user_id = $1)
            and not (f.id = any($2::text[]))
            and (f.name || '' '' || coalesce(f.brand, '''')) operator(extensions.%%>>) ($3::text[])[%s]', i);
    end if;
    candidate_sql := candidate_sql || case when i > 1 then ' intersect ' else '' end || '(' || arm || ')';
  end loop;

  statement := 'with candidates as materialized (' || candidate_sql || '),
    scored as materialized (
      select f.*, public.food_search_quality(f.name, f.brand, $3::text[]) quality
      from candidates c join public.foods f on f.id = c.id
      where (f.user_id is null or f.user_id = $1)
        and not (f.id = any($2::text[]))
    )
    select f.id, f.name, f.brand, f.serving_units, f.calories, f.protein, f.carbs, f.fat, f.source
    from scored f left join public.food_popularity popularity on popularity.food_id = f.id
    where f.quality is not null
    order by f.quality,
      least(pg_catalog.ts_rank_cd(pg_catalog.to_tsvector(''simple''::pg_catalog.regconfig, public.food_search_normalize(f.name || '' '' || coalesce(f.brand, ''''))), $5::tsquery), 1) desc,
      least(ln(1 + greatest(coalesce(popularity.scans, 0), 0)), 2) desc,
      length(f.name), f.id
    limit $6';
  return query execute statement using caller_id, coalesce(exclude_ids, '{}'::text[]), tokens, token_queries, exact_query, requested_limit;
end;
$$;

revoke all on function public.search_foods(text, text[], integer) from public, anon;
grant execute on function public.search_foods(text, text[], integer) to authenticated;
