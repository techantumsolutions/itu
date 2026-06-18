-- Store wholesale (send) vs destination (receive) amounts on raw provider plans.
alter table if exists provider_plans_raw
  add column if not exists destination_amount numeric,
  add column if not exists destination_currency text;

create index if not exists idx_provider_plans_raw_destination
  on provider_plans_raw (destination_amount, destination_currency);
