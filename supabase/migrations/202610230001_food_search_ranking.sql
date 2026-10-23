-- search_foods ranking: whole-word name matches plus dampened popularity.
-- Score = 5 exact name, 2 name starts with the query as a whole word, 1 name contains it as a
-- whole word, 0 otherwise; plus 0.6 * ln(1 + scans). Ties go to the shorter name.
-- Word checks use LIKE on spaces rather than regex: regex per candidate row made broad
-- queries ("milk", 7k candidates) take seconds. Filter patterns are inlined as quoted
-- literals so the planner can use the trigram index, and only words of 3+ characters
-- filter (shorter ones have no trigrams and would force a full scan).
create or replace function public.search_foods(
  q text,
  exclude_ids text[] default '{}',
  max_results integer default 20
)
returns table (
  id text, name text, brand text, serving_units text,
  calories real, protein real, carbs real, fat real, source text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  phrase text := lower(regexp_replace(trim(coalesce(q, '')), '\s+', ' ', 'g'));
  like_phrase text;
  words text[];
  patterns text[];
  stmt text;
  i integer;
begin
  if length(phrase) < 2 then
    return;
  end if;
  like_phrase := replace(replace(replace(phrase, '\', '\\'), '%', '\%'), '_', '\_');
  select array_agg(w) into words
  from (select distinct w from unnest(string_to_array(like_phrase, ' ')) as w
        where length(replace(w, '\', '')) >= 3 limit 8) s;
  if words is null then
    return;
  end if;
  select array_agg('%' || w || '%') into patterns from unnest(words) as w;

  stmt := 'select f.id, f.name, f.brand, f.serving_units, f.calories, f.protein, f.carbs, f.fat, f.source
           from public.foods f
           left join public.food_popularity p on p.food_id = f.id
           where not (f.id = any($2))';
  for i in 1 .. array_length(patterns, 1) loop
    stmt := stmt || format(' and (f.name || '' '' || coalesce(f.brand, '''')) ilike %L', patterns[i]);
  end loop;
  stmt := stmt || ' order by
             (case when lower(f.name) = $1 then 5
                   when lower(f.name) like $3 || '' %'' then 2
                   when lower(f.name) like ''% '' || $3 || '' %'' or lower(f.name) like ''% '' || $3 then 1
                   else 0 end) + 0.6 * ln(1 + coalesce(p.scans, 0)) desc,
             length(f.name) asc,
             f.id
           limit $4';

  return query execute stmt
    using phrase, coalesce(exclude_ids, '{}'::text[]), like_phrase,
          least(greatest(coalesce(max_results, 20), 1), 50);
end;
$$;

revoke all on function public.search_foods(text, text[], integer) from public, anon;
grant execute on function public.search_foods(text, text[], integer) to authenticated;
