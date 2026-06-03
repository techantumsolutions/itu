-- Dynamic telecom catalog schema extensions.
-- Additive only: run after supabase/multi_provider_aggregator_schema.sql

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Provider configuration: split credentials and sync config from provider row
-- ---------------------------------------------------------------------------
create table if not exists provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  auth_type text not null default 'custom',
  credentials_encrypted text not null,
  credentials_version int not null default 1,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id)
);

create table if not exists provider_sync_config (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  catalog_endpoint text,
  operator_endpoint text,
  plan_endpoint text,
  sync_schedule_cron text,
  enabled boolean not null default true,
  retry_limit int not null default 3,
  timeout_seconds int not null default 60,
  options_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id)
);

-- ---------------------------------------------------------------------------
-- Configurable dictionaries for classification and normalization
-- ---------------------------------------------------------------------------
create table if not exists telecom_keyword_rules (
  id uuid primary key default gen_random_uuid(),
  rule_type text not null, -- INCLUDE_TELECOM | EXCLUDE_NON_TELECOM | CATEGORY_HINT
  category text not null, -- MOBILE_OPERATOR | GIFT_CARD | OTT | DTH | UTILITY | ...
  keyword text not null,
  target_field text not null default 'ANY', -- ANY | OPERATOR_NAME | PLAN_NAME | TAGS | BENEFITS | SERVICE_TYPE | CATEGORY
  weight numeric not null default 1,
  is_regex boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_type, category, keyword, target_field)
);

create index if not exists idx_telecom_keyword_rules_active on telecom_keyword_rules (is_active, rule_type, category);

create table if not exists telecom_normalization_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  token_type text not null, -- COUNTRY_NAME | COUNTRY_CODE | DESCRIPTOR | SUFFIX
  scope text not null default 'GLOBAL', -- GLOBAL or ISO3
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token, token_type, scope)
);

create index if not exists idx_telecom_normalization_tokens_active on telecom_normalization_tokens (is_active, scope, token_type);

-- ---------------------------------------------------------------------------
-- Aggregate layers (provider-agnostic intermediate entities)
-- ---------------------------------------------------------------------------
create table if not exists aggregate_operators (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  display_name text not null,
  country_id text not null,
  operator_class text not null default 'MOBILE_OPERATOR',
  confidence_score numeric not null default 0,
  duplicate_confidence text not null default 'low',
  status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name, country_id)
);

create index if not exists idx_aggregate_operators_country on aggregate_operators (country_id, status, display_name);

create table if not exists aggregate_operator_aliases (
  id uuid primary key default gen_random_uuid(),
  aggregate_operator_id uuid not null references aggregate_operators (id) on delete cascade,
  alias_name text not null,
  provider_id uuid references lcr_providers (id) on delete set null,
  provider_operator_raw_id uuid references provider_operator_raw (id) on delete set null,
  confidence_score numeric not null default 0,
  source text not null default 'AUTO',
  created_at timestamptz not null default now(),
  unique (aggregate_operator_id, alias_name)
);

create table if not exists aggregate_plans (
  id uuid primary key default gen_random_uuid(),
  aggregate_operator_id uuid not null references aggregate_operators (id) on delete cascade,
  canonical_name text not null,
  category text not null, -- AIRTIME | DATA | VOICE | SMS | COMBO
  amount numeric,
  currency text,
  validity text,
  benefits_json jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  confidence_score numeric not null default 0,
  status text not null default 'ACTIVE',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aggregate_operator_id, fingerprint)
);

create index if not exists idx_aggregate_plans_operator on aggregate_plans (aggregate_operator_id, category, status);

-- ---------------------------------------------------------------------------
-- Mapping lineage raw -> aggregate -> system
-- ---------------------------------------------------------------------------
create table if not exists aggregate_operator_mappings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_operator_raw_id uuid not null references provider_operator_raw (id) on delete cascade,
  aggregate_operator_id uuid not null references aggregate_operators (id) on delete cascade,
  match_score numeric not null default 0,
  match_confidence text not null default 'low',
  match_reason text,
  is_verified boolean not null default false,
  verified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, provider_operator_raw_id)
);

create table if not exists aggregate_plan_mappings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_plan_raw_id uuid not null references provider_plans_raw (id) on delete cascade,
  aggregate_plan_id uuid not null references aggregate_plans (id) on delete cascade,
  match_score numeric not null default 0,
  match_confidence text not null default 'low',
  match_reason text,
  is_verified boolean not null default false,
  verified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, provider_plan_raw_id)
);

create table if not exists system_operator_lineage (
  id uuid primary key default gen_random_uuid(),
  aggregate_operator_id uuid not null references aggregate_operators (id) on delete cascade,
  system_operator_id uuid not null references system_operators (id) on delete cascade,
  confidence_score numeric not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  unique (aggregate_operator_id, system_operator_id)
);

create table if not exists system_plan_lineage (
  id uuid primary key default gen_random_uuid(),
  aggregate_plan_id uuid not null references aggregate_plans (id) on delete cascade,
  system_plan_id uuid not null references system_plans (id) on delete cascade,
  confidence_score numeric not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  unique (aggregate_plan_id, system_plan_id)
);

-- ---------------------------------------------------------------------------
-- Transformation auditability
-- ---------------------------------------------------------------------------
create table if not exists transform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references lcr_providers (id) on delete set null,
  stage text not null, -- RAW | CLASSIFICATION | AGGREGATE | SYSTEM | MAPPING
  source_table text,
  source_id text,
  target_table text,
  target_id text,
  action text not null,
  reason text,
  confidence_score numeric,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_transform_audit_logs_stage on transform_audit_logs (stage, created_at desc);
create index if not exists idx_transform_audit_logs_source on transform_audit_logs (source_table, source_id);

alter table provider_credentials enable row level security;
alter table provider_sync_config enable row level security;
alter table telecom_keyword_rules enable row level security;
alter table telecom_normalization_tokens enable row level security;
alter table aggregate_operators enable row level security;
alter table aggregate_operator_aliases enable row level security;
alter table aggregate_plans enable row level security;
alter table aggregate_operator_mappings enable row level security;
alter table aggregate_plan_mappings enable row level security;
alter table system_operator_lineage enable row level security;
alter table system_plan_lineage enable row level security;
alter table transform_audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- Default dynamic dictionaries (editable in DB; no code changes required)
-- ---------------------------------------------------------------------------
insert into telecom_keyword_rules (rule_type, category, keyword, target_field, weight, is_regex)
values
  ('INCLUDE_TELECOM', 'MOBILE_OPERATOR', 'mobile', 'SERVICE_TYPE', 3, false),
  ('INCLUDE_TELECOM', 'MOBILE_OPERATOR', 'airtime', 'CATEGORY', 2, false),
  ('INCLUDE_TELECOM', 'DATA_BUNDLE', 'data', 'CATEGORY', 2, false),
  ('INCLUDE_TELECOM', 'VOICE_BUNDLE', 'voice', 'CATEGORY', 2, false),
  ('INCLUDE_TELECOM', 'SMS_BUNDLE', 'sms', 'CATEGORY', 2, false),
  ('INCLUDE_TELECOM', 'COMBO_BUNDLE', 'combo', 'CATEGORY', 2, false),
  ('EXCLUDE_NON_TELECOM', 'GIFT_CARD', 'gift', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'DIGITAL_VOUCHER', 'voucher', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'OTT', 'netflix', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'OTT', 'spotify', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'OTT', 'disney', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'OTT', 'prime', 'ANY', 3, false),
  ('EXCLUDE_NON_TELECOM', 'DTH', 'dish', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'DTH', 'satellite', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'UTILITY', 'electricity', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'UTILITY', 'water', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'UTILITY', 'gas', 'ANY', 4, false),
  ('EXCLUDE_NON_TELECOM', 'UTILITY', 'utility', 'ANY', 4, false)
on conflict (rule_type, category, keyword, target_field) do nothing;

insert into telecom_normalization_tokens (token, token_type, scope)
values
  ('MOBILE', 'DESCRIPTOR', 'GLOBAL'),
  ('TELECOM', 'DESCRIPTOR', 'GLOBAL'),
  ('WIRELESS', 'DESCRIPTOR', 'GLOBAL'),
  ('PREPAID', 'DESCRIPTOR', 'GLOBAL'),
  ('POSTPAID', 'DESCRIPTOR', 'GLOBAL'),
  ('GSM', 'DESCRIPTOR', 'GLOBAL'),
  ('LTE', 'DESCRIPTOR', 'GLOBAL'),
  ('4G', 'DESCRIPTOR', 'GLOBAL'),
  ('5G', 'DESCRIPTOR', 'GLOBAL'),
  ('IND', 'COUNTRY_CODE', 'GLOBAL'),
  ('USA', 'COUNTRY_CODE', 'GLOBAL'),
  ('GBR', 'COUNTRY_CODE', 'GLOBAL'),
  ('NGA', 'COUNTRY_CODE', 'GLOBAL')
on conflict (token, token_type, scope) do nothing;
