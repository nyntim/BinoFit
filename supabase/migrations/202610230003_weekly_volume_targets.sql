-- Optional weekly working-set targets. Safe for existing goals and repeated application.
alter table public.user_goals
  add column if not exists weekly_volume_targets jsonb not null default '{}'::jsonb;
