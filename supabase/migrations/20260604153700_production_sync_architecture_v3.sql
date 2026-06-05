-- Migration file: Production-Grade Sync Architecture Observability & Engine DDL

create table if not exists provider_catalog_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null unique,
  supported_categories text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  operators_fetched int not null default 0,
  operators_accepted int not null default 0,
  operators_rejected int not null default 0,
  plans_fetched int not null default 0,
  plans_accepted int not null default 0,
  plans_rejected int not null default 0,
  status text not null default 'running',
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists classification_review_queue (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  provider_operator_id text,
  provider_plan_id text,
  entity_type text not null, -- 'operator' | 'plan'
  entity_name text not null,
  category text,
  sub_category text,
  benefits jsonb,
  raw_payload jsonb,
  confidence numeric,
  status text not null default 'PENDING', -- PENDING | APPROVED | REJECTED
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_code, entity_type, entity_name)
);

create table if not exists classification_audit (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  provider_operator_id text,
  provider_plan_id text,
  entity_type text not null, -- 'operator' | 'plan'
  entity_name text not null,
  decision text not null, -- ACCEPTED | REJECTED
  classification text not null,
  confidence numeric not null,
  reason_code text not null, -- REJECT_NON_TELECOM, etc.
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists telecom_reference_catalog (
  id uuid primary key default gen_random_uuid(),
  operator_name text not null,
  country_code text not null, -- ISO3 or '*'
  classification text not null default 'TELECOM',
  created_at timestamptz not null default now(),
  unique (operator_name, country_code)
);

create table if not exists classification_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  match_type text not null default 'CONTAINS', -- CONTAINS | EXACT | REGEX
  entity_type text not null, -- operator | plan
  classification text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pattern, match_type, entity_type)
);

create table if not exists operator_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_name text not null unique,
  canonical_name text not null,
  system_operator_id uuid references system_operators(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Update existing operator_mappings and plan_mappings tables to support direct provider mapping
alter table operator_mappings add column if not exists provider_operator_id text;
alter table operator_mappings alter column provider_operator_raw_id drop not null;
alter table operator_mappings drop constraint if exists operator_mappings_provider_op_id_unique;
alter table operator_mappings add constraint operator_mappings_provider_op_id_unique unique (service_provider_id, provider_operator_id);

alter table plan_mappings add column if not exists provider_plan_id text;
alter table plan_mappings alter column provider_plan_raw_id drop not null;
alter table plan_mappings drop constraint if exists plan_mappings_provider_plan_id_unique;
alter table plan_mappings add constraint plan_mappings_provider_plan_id_unique unique (service_provider_id, provider_plan_id);
