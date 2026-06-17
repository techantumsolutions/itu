-- Persistent admin operator merge decisions for reuse during sync.

create table if not exists operator_merge_history (
  id uuid primary key default gen_random_uuid(),
  country_iso3 text not null,
  source_operator_name text not null,
  source_operator_normalized text not null,
  target_operator_name text not null,
  target_operator_normalized text not null,
  merge_reason text not null default 'ADMIN_MERGE',
  merged_by_admin text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_iso3, source_operator_normalized)
);

create index if not exists idx_operator_merge_history_country
  on operator_merge_history (country_iso3, is_active);

create index if not exists idx_operator_merge_history_target
  on operator_merge_history (country_iso3, target_operator_normalized)
  where is_active = true;

drop trigger if exists trg_operator_merge_history_updated_at on operator_merge_history;
create trigger trg_operator_merge_history_updated_at
before update on operator_merge_history
for each row execute function set_updated_at();

alter table operator_merge_history enable row level security;
