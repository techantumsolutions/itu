-- Additive multi-provider aggregator schema.
--
-- This extends the existing LCR v2 tables without destructive changes. Run after
-- supabase/uti_lcr_schema.sql.

create extension if not exists pgcrypto;

create or replace function aggregator_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing provider registry extensions (service provider compatibility)
-- ---------------------------------------------------------------------------
alter table if exists lcr_providers add column if not exists slug text;
alter table if exists lcr_providers add column if not exists provider_type text not null default 'aggregator';
alter table if exists lcr_providers add column if not exists auth_type text not null default 'custom';
alter table if exists lcr_providers add column if not exists sync_frequency text not null default 'daily';
alter table if exists lcr_providers add column if not exists last_sync_at timestamptz;
alter table if exists lcr_providers add column if not exists last_success_sync_at timestamptz;
alter table if exists lcr_providers add column if not exists webhook_url text;
alter table if exists lcr_providers add column if not exists encrypted_credentials_version int not null default 1;

update lcr_providers
set slug = lower(regexp_replace(code, '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null and code is not null;

create unique index if not exists idx_lcr_providers_slug_unique on lcr_providers (slug) where slug is not null;
create index if not exists idx_lcr_providers_type_active on lcr_providers (provider_type, is_active, priority);
create index if not exists idx_lcr_providers_sync_due on lcr_providers (is_active, sync_frequency, last_sync_at);

create or replace view service_providers as
select
  id,
  name,
  coalesce(slug, lower(regexp_replace(code, '[^a-zA-Z0-9]+', '-', 'g'))) as slug,
  provider_type,
  base_url as api_base_url,
  auth_type,
  null::text as api_key,
  null::text as api_secret,
  null::text as username,
  null::text as password,
  null::text as token,
  status,
  sync_frequency,
  last_sync_at,
  last_success_sync_at,
  webhook_url,
  priority,
  is_active,
  created_at,
  updated_at
from lcr_providers;

-- ---------------------------------------------------------------------------
-- Raw operators fetched from external provider APIs
-- ---------------------------------------------------------------------------
create table if not exists provider_operator_raw (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_operator_id text not null,
  provider_operator_name text not null,
  country_code text,
  iso_code text,
  mobile_country_code text,
  logo text,
  operator_type text,
  currency text,
  status text not null default 'ACTIVE',
  raw_response_json jsonb not null default '{}'::jsonb,
  checksum_hash text not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_provider_id, provider_operator_id)
);

drop trigger if exists trg_provider_operator_raw_updated_at on provider_operator_raw;
create trigger trg_provider_operator_raw_updated_at
before update on provider_operator_raw
for each row execute function aggregator_set_updated_at();

create index if not exists idx_provider_operator_raw_provider on provider_operator_raw (service_provider_id, fetched_at desc);
create index if not exists idx_provider_operator_raw_country on provider_operator_raw (iso_code, country_code);
create index if not exists idx_provider_operator_raw_checksum on provider_operator_raw (checksum_hash);
create index if not exists idx_provider_operator_raw_json on provider_operator_raw using gin (raw_response_json);

-- ---------------------------------------------------------------------------
-- Unified operators shown on the website
-- ---------------------------------------------------------------------------
create table if not exists system_operators (
  id uuid primary key default gen_random_uuid(),
  system_operator_name text not null,
  slug text not null,
  country_id text not null,
  logo text,
  operator_type text,
  status text not null default 'ACTIVE',
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(system_operator_name, '') || ' ' || coalesce(country_id, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, country_id)
);

drop trigger if exists trg_system_operators_updated_at on system_operators;
create trigger trg_system_operators_updated_at
before update on system_operators
for each row execute function aggregator_set_updated_at();

create index if not exists idx_system_operators_country_status on system_operators (country_id, status, system_operator_name);
create index if not exists idx_system_operators_search on system_operators using gin (search_vector);

create table if not exists operator_mappings (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_operator_raw_id uuid not null references provider_operator_raw (id) on delete cascade,
  system_operator_id uuid not null references system_operators (id) on delete cascade,
  mapping_confidence numeric not null default 0,
  mapping_type text not null default 'AUTO',
  is_verified boolean not null default false,
  verified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_provider_id, provider_operator_raw_id)
);

drop trigger if exists trg_operator_mappings_updated_at on operator_mappings;
create trigger trg_operator_mappings_updated_at
before update on operator_mappings
for each row execute function aggregator_set_updated_at();

create index if not exists idx_operator_mappings_system on operator_mappings (system_operator_id);
create index if not exists idx_operator_mappings_verified on operator_mappings (is_verified, mapping_confidence desc);

-- ---------------------------------------------------------------------------
-- Existing raw plan extensions
-- ---------------------------------------------------------------------------
alter table if exists provider_plans_raw add column if not exists provider_operator_raw_id uuid references provider_operator_raw (id) on delete set null;
alter table if exists provider_plans_raw add column if not exists provider_plan_name text;
alter table if exists provider_plans_raw add column if not exists provider_plan_code text;
alter table if exists provider_plans_raw add column if not exists amount numeric;
alter table if exists provider_plans_raw add column if not exists currency text;
alter table if exists provider_plans_raw add column if not exists validity text;
alter table if exists provider_plans_raw add column if not exists talktime text;
alter table if exists provider_plans_raw add column if not exists data_volume text;
alter table if exists provider_plans_raw add column if not exists sms text;
alter table if exists provider_plans_raw add column if not exists description text;
alter table if exists provider_plans_raw add column if not exists plan_type text;
alter table if exists provider_plans_raw add column if not exists benefits_json jsonb not null default '{}'::jsonb;

create index if not exists idx_provider_plans_raw_operator on provider_plans_raw (provider_operator_raw_id);
create index if not exists idx_provider_plans_raw_amount_currency on provider_plans_raw (amount, currency);
create index if not exists idx_provider_plans_raw_plan_type on provider_plans_raw (plan_type);
create index if not exists idx_provider_plans_raw_benefits on provider_plans_raw using gin (benefits_json);

-- ---------------------------------------------------------------------------
-- Unified website-visible plans
-- ---------------------------------------------------------------------------
create table if not exists system_plans (
  id uuid primary key default gen_random_uuid(),
  system_operator_id uuid not null references system_operators (id) on delete cascade,
  internal_plan_id uuid references internal_plans (id) on delete set null,
  system_plan_name text not null,
  slug text not null,
  amount numeric,
  currency text,
  validity text,
  talktime text,
  data_volume text,
  sms text,
  plan_type text,
  description text,
  normalized_signature text not null,
  status text not null default 'ACTIVE',
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(system_plan_name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(plan_type, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (system_operator_id, normalized_signature)
);

drop trigger if exists trg_system_plans_updated_at on system_plans;
create trigger trg_system_plans_updated_at
before update on system_plans
for each row execute function aggregator_set_updated_at();

create index if not exists idx_system_plans_operator_status on system_plans (system_operator_id, status, amount);
create index if not exists idx_system_plans_internal on system_plans (internal_plan_id);
create index if not exists idx_system_plans_signature on system_plans (normalized_signature);
create index if not exists idx_system_plans_search on system_plans using gin (search_vector);

create table if not exists plan_mappings (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_plan_raw_id uuid not null references provider_plans_raw (id) on delete cascade,
  system_plan_id uuid not null references system_plans (id) on delete cascade,
  matching_score numeric not null default 0,
  matching_reason text,
  is_verified boolean not null default false,
  verified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_provider_id, provider_plan_raw_id)
);

drop trigger if exists trg_plan_mappings_updated_at on plan_mappings;
create trigger trg_plan_mappings_updated_at
before update on plan_mappings
for each row execute function aggregator_set_updated_at();

create index if not exists idx_plan_mappings_system on plan_mappings (system_plan_id);
create index if not exists idx_plan_mappings_verified on plan_mappings (is_verified, matching_score desc);

create table if not exists duplicate_plan_suggestions (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_plan_raw_id uuid not null references provider_plans_raw (id) on delete cascade,
  suggested_system_plan_id uuid references system_plans (id) on delete cascade,
  match_score numeric not null default 0,
  match_reason text,
  benefits_comparison jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_provider_id, provider_plan_raw_id, suggested_system_plan_id)
);

drop trigger if exists trg_duplicate_plan_suggestions_updated_at on duplicate_plan_suggestions;
create trigger trg_duplicate_plan_suggestions_updated_at
before update on duplicate_plan_suggestions
for each row execute function aggregator_set_updated_at();

create index if not exists idx_duplicate_suggestions_status on duplicate_plan_suggestions (status, match_score desc, created_at desc);
create index if not exists idx_duplicate_suggestions_plan on duplicate_plan_suggestions (suggested_system_plan_id);

-- ---------------------------------------------------------------------------
-- Sync and mapping audit logs
-- ---------------------------------------------------------------------------
create table if not exists sync_logs (
  id uuid primary key default gen_random_uuid(),
  service_provider_id uuid references lcr_providers (id) on delete set null,
  sync_type text not null,
  stage text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms int,
  fetched_count int not null default 0,
  normalized_count int not null default 0,
  created_count int not null default 0,
  mapped_count int not null default 0,
  duplicate_count int not null default 0,
  error_message text,
  retry_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sync_logs_provider_time on sync_logs (service_provider_id, created_at desc);
create index if not exists idx_sync_logs_status_stage on sync_logs (status, stage, created_at desc);

create table if not exists mapping_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_json jsonb,
  after_json jsonb,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_mapping_audit_logs_time on mapping_audit_logs (created_at desc);
create index if not exists idx_mapping_audit_logs_entity on mapping_audit_logs (entity_type, entity_id);

-- Service-role application access follows the existing repo pattern.
alter table provider_operator_raw enable row level security;
alter table system_operators enable row level security;
alter table operator_mappings enable row level security;
alter table system_plans enable row level security;
alter table plan_mappings enable row level security;
alter table duplicate_plan_suggestions enable row level security;
alter table sync_logs enable row level security;
alter table mapping_audit_logs enable row level security;
