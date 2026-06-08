-- Enterprise catalog intelligence layer (additive, backward compatible)

-- ---------------------------------------------------------------------------
-- Raw plan quality tracking (never delete raw records)
-- ---------------------------------------------------------------------------
alter table if exists provider_plans_raw add column if not exists raw_quality_score numeric;
alter table if exists provider_plans_raw add column if not exists has_description boolean default false;
alter table if exists provider_plans_raw add column if not exists has_benefits boolean default false;
alter table if exists provider_plans_raw add column if not exists has_category boolean default false;
alter table if exists provider_plans_raw add column if not exists has_amount boolean default false;
alter table if exists provider_plans_raw add column if not exists has_validity boolean default false;
alter table if exists provider_plans_raw add column if not exists has_currency boolean default false;
alter table if exists provider_plans_raw add column if not exists raw_completeness_percent numeric default 0;
alter table if exists provider_plans_raw add column if not exists catalog_status text default 'ACTIVE';
alter table if exists provider_plans_raw add column if not exists confidence_level text;
alter table if exists provider_plans_raw add column if not exists confidence_score numeric;

-- ---------------------------------------------------------------------------
-- System operator sync health (soft deactivation)
-- ---------------------------------------------------------------------------
alter table if exists system_operators add column if not exists failed_sync_count int not null default 0;
alter table if exists system_operators add column if not exists last_valid_sync_at timestamptz;
alter table if exists system_operators add column if not exists confidence_level text;
alter table if exists system_operators add column if not exists is_trusted_telecom boolean default false;

alter table if exists system_plans add column if not exists catalog_status text default 'ACTIVE';
alter table if exists system_plans add column if not exists confidence_level text;
alter table if exists system_plans add column if not exists confidence_score numeric;

-- ---------------------------------------------------------------------------
-- Catalog enrichment (inferred metadata from weak payloads)
-- ---------------------------------------------------------------------------
create table if not exists catalog_enrichment (
  id uuid primary key default gen_random_uuid(),
  provider_plan_raw_id uuid not null references provider_plans_raw (id) on delete cascade,
  normalized_title text,
  normalized_description text,
  inferred_service_type text,
  inferred_subservice text,
  inferred_validity text,
  inferred_data_mb numeric,
  inferred_talktime text,
  inferred_sms text,
  confidence_score numeric not null default 0,
  enrichment_source text not null default 'title_intelligence',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_plan_raw_id)
);

create index if not exists idx_catalog_enrichment_plan on catalog_enrichment (provider_plan_raw_id);

-- ---------------------------------------------------------------------------
-- Trusted telecom operator registry
-- ---------------------------------------------------------------------------
create table if not exists operator_trust_registry (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default '*',
  normalized_name text not null,
  display_name text not null,
  operator_type text not null default 'MOBILE',
  trust_level text not null default 'HIGH',
  is_verified_telecom boolean not null default true,
  manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_code, normalized_name)
);

create index if not exists idx_operator_trust_name on operator_trust_registry (normalized_name);

-- ---------------------------------------------------------------------------
-- Plan classification audit (production debugging)
-- ---------------------------------------------------------------------------
create table if not exists plan_classification_audit (
  id uuid primary key default gen_random_uuid(),
  provider_code text,
  provider_plan_raw_id uuid references provider_plans_raw (id) on delete set null,
  provider_operator_id text,
  provider_plan_id text,
  entity_type text not null default 'plan',
  classification text not null,
  confidence_level text not null,
  confidence_score numeric not null default 0,
  catalog_status text not null default 'ACTIVE',
  matched_keywords text[] not null default '{}'::text[],
  confidence_breakdown jsonb not null default '{}'::jsonb,
  rejection_reason text,
  sync_run_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_plan_classification_audit_created on plan_classification_audit (created_at desc);
create index if not exists idx_plan_classification_audit_operator on plan_classification_audit (provider_operator_id);

-- ---------------------------------------------------------------------------
-- Manual review queue (unknown / low confidence)
-- ---------------------------------------------------------------------------
create table if not exists catalog_review_queue (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  provider_operator_id text,
  provider_plan_id text,
  provider_plan_raw_id uuid references provider_plans_raw (id) on delete set null,
  entity_type text not null,
  entity_name text not null,
  confidence_level text not null default 'UNKNOWN',
  confidence_score numeric not null default 0,
  classification text,
  catalog_status text not null default 'REVIEW',
  raw_payload jsonb,
  notes text,
  status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_catalog_review_queue_status on catalog_review_queue (status, created_at desc);

-- Seed trusted global telecom operators
insert into operator_trust_registry (country_code, normalized_name, display_name, operator_type, trust_level, is_verified_telecom)
values
  ('*', 'JIO', 'Jio', 'MOBILE', 'HIGH', true),
  ('*', 'JOI', 'Joi', 'MOBILE', 'HIGH', true),
  ('*', 'AIRTEL', 'Airtel', 'MOBILE', 'HIGH', true),
  ('*', 'VODAFONE', 'Vodafone', 'MOBILE', 'HIGH', true),
  ('*', 'IDEA', 'Idea', 'MOBILE', 'HIGH', true),
  ('*', 'VI', 'Vi', 'MOBILE', 'HIGH', true),
  ('*', 'BSNL', 'BSNL', 'MOBILE', 'HIGH', true),
  ('*', 'MTN', 'MTN', 'MOBILE', 'HIGH', true),
  ('*', 'ORANGE', 'Orange', 'MOBILE', 'HIGH', true),
  ('*', 'CLARO', 'Claro', 'MOBILE', 'HIGH', true),
  ('*', 'GLOBE', 'Globe', 'MOBILE', 'HIGH', true),
  ('*', 'SMART', 'Smart', 'MOBILE', 'HIGH', true),
  ('*', 'TELKOMSEL', 'Telkomsel', 'MOBILE', 'HIGH', true),
  ('*', 'XL', 'XL Axiata', 'MOBILE', 'HIGH', true),
  ('*', 'TMOBILE', 'T-Mobile', 'MOBILE', 'HIGH', true),
  ('*', 'AT&T', 'AT&T', 'MOBILE', 'HIGH', true),
  ('*', 'ATT', 'AT&T', 'MOBILE', 'HIGH', true),
  ('*', 'VERIZON', 'Verizon', 'MOBILE', 'HIGH', true),
  ('*', 'O2', 'O2', 'MOBILE', 'HIGH', true),
  ('*', 'EE', 'EE', 'MOBILE', 'HIGH', true),
  ('*', 'THREE', 'Three', 'MOBILE', 'HIGH', true),
  ('*', 'TELSTRA', 'Telstra', 'MOBILE', 'HIGH', true),
  ('*', 'OPTUS', 'Optus', 'MOBILE', 'HIGH', true),
  ('*', 'SAFARICOM', 'Safaricom', 'MOBILE', 'HIGH', true),
  ('*', 'GLO', 'Glo', 'MOBILE', 'HIGH', true),
  ('*', 'AIRTEL AFRICA', 'Airtel Africa', 'MOBILE', 'HIGH', true)
on conflict (country_code, normalized_name) do nothing;

alter table catalog_enrichment enable row level security;
alter table operator_trust_registry enable row level security;
alter table plan_classification_audit enable row level security;
alter table catalog_review_queue enable row level security;
