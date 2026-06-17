-- Persistent merge history: operator key aliases + plan merge history table.

alter table if exists operator_merge_history
  add column if not exists source_merge_key text,
  add column if not exists target_merge_key text;

update operator_merge_history
set
  source_merge_key = coalesce(source_merge_key, source_operator_normalized),
  target_merge_key = coalesce(target_merge_key, target_operator_normalized)
where source_merge_key is null or target_merge_key is null;

create index if not exists idx_operator_merge_history_source_key
  on operator_merge_history (country_iso3, source_merge_key)
  where is_active = true;

create table if not exists plan_merge_history (
  id uuid primary key default gen_random_uuid(),
  country_iso3 text not null,
  system_operator_merge_key text not null,
  source_plan_signature text not null,
  target_plan_signature text not null,
  source_plan_name text not null,
  target_plan_name text not null,
  merge_reason text not null default 'ADMIN_MERGE',
  merged_by_admin text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_iso3, system_operator_merge_key, source_plan_signature)
);

create index if not exists idx_plan_merge_history_country
  on plan_merge_history (country_iso3, is_active);

create index if not exists idx_plan_merge_history_target
  on plan_merge_history (country_iso3, system_operator_merge_key, target_plan_signature)
  where is_active = true;

drop trigger if exists trg_plan_merge_history_updated_at on plan_merge_history;
create trigger trg_plan_merge_history_updated_at
before update on plan_merge_history
for each row execute function set_updated_at();

alter table plan_merge_history enable row level security;
