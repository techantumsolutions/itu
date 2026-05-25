-- Run in Supabase SQL Editor (additive). Creates normalized tables for aggregator-synced catalog
-- WITHOUT touching existing countries/operators/plans tables.
--
-- Design goals:
-- - multi-aggregator support via `provider`
-- - scalable indexing for millions of plans
-- - raw_response JSONB preserved for future fields
-- - created_at/updated_at on all tables

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers: updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Countries (ISO3 used by many aggregators e.g., NGA/IND)
-- ---------------------------------------------------------------------------
create table if not exists agg_countries (
  iso3 text primary key,
  iso2 text,
  name text not null,
  status text not null default 'active', -- active|inactive
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agg_countries_status on agg_countries (status);

drop trigger if exists trg_agg_countries_updated_at on agg_countries;
create trigger trg_agg_countries_updated_at
before update on agg_countries
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Operators
-- ---------------------------------------------------------------------------
create table if not exists agg_operators (
  id uuid primary key default gen_random_uuid(),
  provider text not null, -- e.g. 'dtone'
  aggregator_operator_id bigint not null,
  country_iso3 text not null references agg_countries (iso3) on delete cascade,
  name text not null,
  regions jsonb not null default '[]'::jsonb,
  status text not null default 'active', -- active|inactive
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, aggregator_operator_id)
);

create index if not exists idx_agg_operators_country on agg_operators (country_iso3);
create index if not exists idx_agg_operators_provider on agg_operators (provider);
create index if not exists idx_agg_operators_status on agg_operators (status);

drop trigger if exists trg_agg_operators_updated_at on agg_operators;
create trigger trg_agg_operators_updated_at
before update on agg_operators
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Services / Subservices (normalized)
-- ---------------------------------------------------------------------------
create table if not exists agg_services (
  provider text not null,
  service_id int not null,
  name text not null,
  status text not null default 'active',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, service_id)
);

drop trigger if exists trg_agg_services_updated_at on agg_services;
create trigger trg_agg_services_updated_at
before update on agg_services
for each row execute function set_updated_at();

create table if not exists agg_subservices (
  provider text not null,
  subservice_id int not null,
  service_id int not null,
  name text not null,
  status text not null default 'active',
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, subservice_id),
  constraint fk_agg_subservices_service
    foreign key (provider, service_id)
    references agg_services (provider, service_id)
    on delete cascade
);

create index if not exists idx_agg_subservices_service on agg_subservices (provider, service_id);

drop trigger if exists trg_agg_subservices_updated_at on agg_subservices;
create trigger trg_agg_subservices_updated_at
before update on agg_subservices
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Plans (core)
-- ---------------------------------------------------------------------------
create table if not exists agg_plans (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  aggregator_plan_id bigint not null,
  operator_id uuid not null references agg_operators (id) on delete cascade,
  service_id int,
  subservice_id int,
  type text not null, -- FIXED_VALUE_RECHARGE, RANGE_VALUE_RECHARGE, etc
  name text not null,
  description text,
  availability_zones text[] not null default '{}'::text[],

  destination_amount numeric,
  destination_unit text,
  destination_unit_type text,

  retail_amount numeric,
  retail_fee numeric,
  wholesale_amount numeric,
  wholesale_fee numeric,
  source_amount numeric,
  source_unit text,
  currency_unit text, -- typically EUR

  rate_base numeric,
  rate_retail numeric,
  rate_wholesale numeric,

  validity_quantity int,
  validity_unit text,

  tags text[] not null default '{}'::text[],

  status text not null default 'active', -- active|inactive|disabled
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (provider, aggregator_plan_id),
  constraint fk_agg_plans_service foreign key (provider, service_id)
    references agg_services (provider, service_id) on delete set null,
  constraint fk_agg_plans_subservice foreign key (provider, subservice_id)
    references agg_subservices (provider, subservice_id) on delete set null
);

create index if not exists idx_agg_plans_provider on agg_plans (provider);
create index if not exists idx_agg_plans_operator on agg_plans (operator_id);
create index if not exists idx_agg_plans_status on agg_plans (status);
create index if not exists idx_agg_plans_validity on agg_plans (validity_quantity, validity_unit);
create index if not exists idx_agg_plans_prices on agg_plans (retail_amount, wholesale_amount);
create index if not exists idx_agg_plans_tags_gin on agg_plans using gin (tags);
create index if not exists idx_agg_plans_zones_gin on agg_plans using gin (availability_zones);

drop trigger if exists trg_agg_plans_updated_at on agg_plans;
create trigger trg_agg_plans_updated_at
before update on agg_plans
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Plan benefits
-- ---------------------------------------------------------------------------
create table if not exists agg_plan_benefits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references agg_plans (id) on delete cascade,
  type text not null, -- DATA|VOICE|SMS|BONUS|COMBO
  amount_base numeric,
  promotion_bonus numeric,
  total_excluding_tax numeric,
  total_including_tax numeric,
  unit text,
  unit_type text,
  additional_information text,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agg_plan_benefits_plan on agg_plan_benefits (plan_id);
create index if not exists idx_agg_plan_benefits_type on agg_plan_benefits (type);

drop trigger if exists trg_agg_plan_benefits_updated_at on agg_plan_benefits;
create trigger trg_agg_plan_benefits_updated_at
before update on agg_plan_benefits
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Required fields (normalized from array-of-arrays)
-- ---------------------------------------------------------------------------
create table if not exists agg_plan_required_fields (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references agg_plans (id) on delete cascade,
  field_group int not null default 0,
  field_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, field_group, field_name)
);

create index if not exists idx_agg_plan_required_fields_plan on agg_plan_required_fields (plan_id);

drop trigger if exists trg_agg_plan_required_fields_updated_at on agg_plan_required_fields;
create trigger trg_agg_plan_required_fields_updated_at
before update on agg_plan_required_fields
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Exchange rates snapshot (optional: store rates seen in catalog or during tx)
-- ---------------------------------------------------------------------------
create table if not exists agg_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  from_unit text not null,
  to_unit text not null,
  kind text not null default 'catalog', -- catalog|tx|manual
  rate numeric not null,
  captured_at timestamptz not null default now(),
  raw_response jsonb not null default '{}'::jsonb
);

create index if not exists idx_agg_exchange_rates_pair_time on agg_exchange_rates (provider, from_unit, to_unit, captured_at desc);

-- ---------------------------------------------------------------------------
-- API logs (for sync observability + troubleshooting)
-- ---------------------------------------------------------------------------
create table if not exists agg_api_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  method text not null default 'GET',
  status int,
  request_id uuid,
  duration_ms int,
  error text,
  response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agg_api_logs_provider_time on agg_api_logs (provider, created_at desc);
create index if not exists idx_agg_api_logs_status_time on agg_api_logs (status, created_at desc);

-- Keep parity with existing approach: enable RLS; app uses service role.
alter table agg_countries enable row level security;
alter table agg_operators enable row level security;
alter table agg_services enable row level security;
alter table agg_subservices enable row level security;
alter table agg_plans enable row level security;
alter table agg_plan_benefits enable row level security;
alter table agg_plan_required_fields enable row level security;
alter table agg_exchange_rates enable row level security;
alter table agg_api_logs enable row level security;

