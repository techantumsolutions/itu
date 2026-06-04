-- Table to store details of filtered/skipped operators for auditing and debugging.
create table if not exists agg_filtered_operators (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  raw_operator_id uuid not null references provider_operator_raw (id) on delete cascade,
  raw_operator_name text not null,
  filter_reason text not null,
  classification_score numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, raw_operator_id)
);

alter table agg_filtered_operators enable row level security;

-- Add updated_at trigger
drop trigger if exists trg_agg_filtered_operators_updated_at on agg_filtered_operators;
create trigger trg_agg_filtered_operators_updated_at
before update on agg_filtered_operators
for each row execute function set_updated_at();
