-- Additive schema for multi-aggregator support, raw plan storage, normalization (UTI plans),
-- mapping, LCR routing rules, health metrics, and audit logs.
--
-- IMPORTANT: This does NOT modify existing tables/modules.
-- Run in Supabase SQL Editor (once).

create extension if not exists pgcrypto;

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
-- Provider registry (admin-configurable)
-- ---------------------------------------------------------------------------
create table if not exists lcr_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- DTONE, DING, RELOADLY, CUSTOM_*
  name text not null,
  adapter_key text not null, -- dtone|ding|reloadly|custom
  is_active boolean not null default true,
  priority int not null default 100, -- lower is preferred
  base_url text,
  refresh_interval_minutes int not null default 60,
  supported_countries text[] not null default '{}'::text[],
  supported_services text[] not null default '{}'::text[],
  supported_tags text[] not null default '{}'::text[],
  credentials_encrypted text, -- encrypted blob (handled app-side)
  status text not null default 'unknown', -- online|offline|degraded|unknown
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_lcr_providers_updated_at on lcr_providers;
create trigger trg_lcr_providers_updated_at
before update on lcr_providers
for each row execute function set_updated_at();

create index if not exists idx_lcr_providers_active_priority on lcr_providers (is_active, priority);

-- ---------------------------------------------------------------------------
-- Raw plan storage (audit/debug/reprocessing)
-- ---------------------------------------------------------------------------
create table if not exists provider_plans_raw (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_plan_id text not null,
  raw_json jsonb not null,
  checksum_hash text not null,
  fetched_at timestamptz not null default now(),
  status text not null default 'active', -- active|inactive|deleted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, provider_plan_id)
);

drop trigger if exists trg_provider_plans_raw_updated_at on provider_plans_raw;
create trigger trg_provider_plans_raw_updated_at
before update on provider_plans_raw
for each row execute function set_updated_at();

create index if not exists idx_provider_plans_raw_provider_fetch on provider_plans_raw (provider_id, fetched_at desc);
create index if not exists idx_provider_plans_raw_checksum on provider_plans_raw (checksum_hash);
create index if not exists idx_provider_plans_raw_status on provider_plans_raw (status);
create index if not exists idx_provider_plans_raw_json_gin on provider_plans_raw using gin (raw_json);

-- ---------------------------------------------------------------------------
-- Normalized internal plans (UTI plans)
-- ---------------------------------------------------------------------------
create table if not exists internal_plans (
  id uuid primary key default gen_random_uuid(),
  country_iso3 text not null,
  operator_ref text not null, -- normalized operator key (provider-agnostic)
  service text not null, -- Mobile
  subservice text, -- Data/Voice/SMS/Airtime/Combo etc
  category text not null default 'topup', -- topup|data|combo|airtime
  uti_plan_name text not null,
  uti_description text,
  normalized_hash text not null, -- stable fingerprint (country+operator+benefits+validity+amount+type)
  canonical_signature text not null, -- human-readable signature for review
  confidence text not null default 'exact', -- exact|high|partial|manual
  active boolean not null default true,
  raw_response jsonb not null default '{}'::jsonb, -- optional merged canonical view
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_hash)
);

drop trigger if exists trg_internal_plans_updated_at on internal_plans;
create trigger trg_internal_plans_updated_at
before update on internal_plans
for each row execute function set_updated_at();

create index if not exists idx_internal_plans_country_operator on internal_plans (country_iso3, operator_ref);
create index if not exists idx_internal_plans_active on internal_plans (active);
create index if not exists idx_internal_plans_category on internal_plans (category);

-- ---------------------------------------------------------------------------
-- Mapping: internal plan -> provider plans
-- ---------------------------------------------------------------------------
create table if not exists internal_plan_provider_mapping (
  id uuid primary key default gen_random_uuid(),
  internal_plan_id uuid not null references internal_plans (id) on delete cascade,
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_plan_id text not null,
  provider_price numeric,
  provider_currency text,
  provider_priority int not null default 100,
  margin numeric not null default 0,
  enabled boolean not null default true,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, provider_plan_id),
  unique (internal_plan_id, provider_id, provider_plan_id)
);

drop trigger if exists trg_internal_plan_provider_mapping_updated_at on internal_plan_provider_mapping;
create trigger trg_internal_plan_provider_mapping_updated_at
before update on internal_plan_provider_mapping
for each row execute function set_updated_at();

create index if not exists idx_mapping_internal on internal_plan_provider_mapping (internal_plan_id);
create index if not exists idx_mapping_provider_enabled on internal_plan_provider_mapping (provider_id, enabled);
create index if not exists idx_mapping_price on internal_plan_provider_mapping (provider_currency, provider_price);

-- ---------------------------------------------------------------------------
-- Review queue for low-confidence matches
-- ---------------------------------------------------------------------------
create table if not exists plan_review_queue (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  provider_plan_id text not null,
  normalized_hash text not null,
  confidence_score numeric not null default 0,
  status text not null default 'pending', -- pending|resolved|ignored
  notes text,
  raw_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, provider_plan_id)
);

drop trigger if exists trg_plan_review_queue_updated_at on plan_review_queue;
create trigger trg_plan_review_queue_updated_at
before update on plan_review_queue
for each row execute function set_updated_at();

create index if not exists idx_review_queue_status on plan_review_queue (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Routing rules (admin-defined)
-- ---------------------------------------------------------------------------
create table if not exists lcr_routing_rules (
  id uuid primary key default gen_random_uuid(),
  country_iso3 text not null default '*',
  operator_ref text,
  service text,
  routing_type text not null default 'LCR', -- LCR|PRIORITY|FIXED
  fixed_provider_id uuid references lcr_providers (id) on delete set null,
  priorities jsonb not null default '[]'::jsonb, -- [{providerId, priority}]
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_lcr_routing_rules_updated_at on lcr_routing_rules;
create trigger trg_lcr_routing_rules_updated_at
before update on lcr_routing_rules
for each row execute function set_updated_at();

create index if not exists idx_lcr_rules_active_country on lcr_routing_rules (is_active, country_iso3);

-- ---------------------------------------------------------------------------
-- Provider health metrics (rolling window snapshots)
-- ---------------------------------------------------------------------------
create table if not exists provider_health_metrics (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  window_minutes int not null default 60,
  success_rate numeric,
  failure_rate numeric,
  avg_latency_ms int,
  timeout_rate numeric,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  captured_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

create index if not exists idx_health_provider_time on provider_health_metrics (provider_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Audit logs (admin actions, mapping changes, routing decisions)
-- ---------------------------------------------------------------------------
create table if not exists lcr_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  entity_type text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lcr_audit_logs_time on lcr_audit_logs (created_at desc);
create index if not exists idx_lcr_audit_logs_action on lcr_audit_logs (action);

-- RLS enabled (service-role app access like the rest of this repo)
alter table lcr_providers enable row level security;
alter table provider_plans_raw enable row level security;
alter table internal_plans enable row level security;
alter table internal_plan_provider_mapping enable row level security;
alter table plan_review_queue enable row level security;
alter table lcr_routing_rules enable row level security;
alter table provider_health_metrics enable row level security;
alter table lcr_audit_logs enable row level security;

