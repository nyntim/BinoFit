-- Food catalog search: micronutrient columns, trigram index, popularity and ranked search.

-- Micronutrient columns declared in schema.sql (BEGIN micronutrient_food_columns).
alter table public.foods
  add column if not exists fiber real,
  add column if not exists sugar real,
  add column if not exists added_sugar real,
  add column if not exists saturated_fat real,
  add column if not exists trans_fat real,
  add column if not exists monounsat_fat real,
  add column if not exists polyunsat_fat real,
  add column if not exists cholesterol real,
  add column if not exists sodium real,
  add column if not exists potassium real,
  add column if not exists calcium real,
  add column if not exists iron real,
  add column if not exists magnesium real,
  add column if not exists zinc real,
  add column if not exists phosphorus real,
  add column if not exists copper real,
  add column if not exists manganese real,
  add column if not exists selenium real,
  add column if not exists vitamin_a real,
  add column if not exists vitamin_c real,
  add column if not exists vitamin_d real,
  add column if not exists vitamin_e real,
  add column if not exists vitamin_k real,
  add column if not exists thiamin real,
  add column if not exists riboflavin real,
  add column if not exists niacin real,
  add column if not exists b6 real,
  add column if not exists folate real,
  add column if not exists b12 real,
  add column if not exists choline real;

create extension if not exists pg_trgm with schema extensions;

-- One trigram index over name and brand; search_foods filters on this exact expression.
create index if not exists idx_foods_search_trgm
  on public.foods using gin ((name || ' ' || coalesce(brand, '')) extensions.gin_trgm_ops);

-- Server-only ranking signal (Open Food Facts unique scans). Not synced to devices.
create table if not exists public.food_popularity (
  food_id text primary key references public.foods (id) on delete cascade,
  scans   integer not null default 0
);
alter table public.food_popularity enable row level security;
drop policy if exists "food_popularity: read" on public.food_popularity;
create policy "food_popularity: read"
  on public.food_popularity for select to authenticated using (true);

-- Ranked catalog search. Every word must appear in name or brand. Order: exact name,
-- name starts with the query, name contains the query, popularity, shorter name.
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
  esc_phrase text;
  words text[];
  patterns text[];
  stmt text;
  i integer;
begin
  if length(phrase) < 2 then
    return;
  end if;
  esc_phrase := replace(replace(replace(phrase, '\', '\\'), '%', '\%'), '_', '\_');
  select array_agg(w) into words
  from (select distinct w from unnest(string_to_array(esc_phrase, ' ')) as w where w <> '' limit 8) s;
  if words is null then
    return;
  end if;
  select array_agg('%' || w || '%') into patterns from unnest(words) as w;

  stmt := 'select f.id, f.name, f.brand, f.serving_units, f.calories, f.protein, f.carbs, f.fat, f.source
           from public.foods f
           left join public.food_popularity p on p.food_id = f.id
           where not (f.id = any($2))';
  for i in 1 .. array_length(patterns, 1) loop
    stmt := stmt || format(' and (f.name || '' '' || coalesce(f.brand, '''')) ilike $3[%s]', i);
  end loop;
  stmt := stmt || ' order by
             (lower(f.name) = $1) desc,
             (lower(f.name) like $4) desc,
             (lower(f.name) like $5) desc,
             coalesce(p.scans, 0) desc,
             length(f.name) asc,
             f.id
           limit $6';

  return query execute stmt
    using phrase, coalesce(exclude_ids, '{}'::text[]), patterns,
          esc_phrase || '%', '%' || esc_phrase || '%',
          least(greatest(coalesce(max_results, 20), 1), 50);
end;
$$;

revoke all on function public.search_foods(text, text[], integer) from public, anon;
grant execute on function public.search_foods(text, text[], integer) to authenticated;
