-- Centralized routing engine schema (additive, backward compatible).
-- Run in Supabase SQL Editor after uti_lcr_schema.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- LCR engine settings (singleton row)
-- ---------------------------------------------------------------------------
create table if not exists lcr_engine_settings (
  id uuid primary key default gen_random_uuid(),
  enabled boolean not null default true,
  routing_strategy text not null default 'LEAST_COST'
    check (routing_strategy in ('LEAST_COST', 'PRIORITY', 'HIGHEST_MARGIN')),
  fallback_strategy text not null default 'NEXT_PROVIDER'
    check (fallback_strategy in ('NEXT_PROVIDER', 'PRIORITY_PROVIDER')),
  auto_failover boolean not null default true,
  retry_enabled boolean not null default true,
  retry_attempts int not null default 2 check (retry_attempts >= 0 and retry_attempts <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_lcr_engine_settings_updated_at on lcr_engine_settings;
create trigger trg_lcr_engine_settings_updated_at
before update on lcr_engine_settings
for each row execute function set_updated_at();

insert into lcr_engine_settings (enabled, routing_strategy, fallback_strategy, auto_failover, retry_enabled, retry_attempts)
select true, 'LEAST_COST', 'NEXT_PROVIDER', true, true, 2
where not exists (select 1 from lcr_engine_settings limit 1);

-- ---------------------------------------------------------------------------
-- Provider priorities (used when routing_strategy = PRIORITY)
-- ---------------------------------------------------------------------------
create table if not exists provider_priorities (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references lcr_providers (id) on delete cascade,
  priority int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id)
);

drop trigger if exists trg_provider_priorities_updated_at on provider_priorities;
create trigger trg_provider_priorities_updated_at
before update on provider_priorities
for each row execute function set_updated_at();

create index if not exists idx_provider_priorities_order on provider_priorities (priority asc);

-- Seed priorities from existing lcr_providers.priority when empty
insert into provider_priorities (provider_id, priority)
select p.id, p.priority
from lcr_providers p
where not exists (select 1 from provider_priorities limit 1)
on conflict (provider_id) do nothing;

-- ---------------------------------------------------------------------------
-- Routing rules (bypass LCR — force provider)
-- ---------------------------------------------------------------------------
create table if not exists routing_rules (
  id uuid primary key default gen_random_uuid(),
  rule_name text not null,
  country_id text,
  operator_id text,
  product_type text,
  provider_id uuid not null references lcr_providers (id) on delete restrict,
  priority int not null default 100,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_routing_rules_updated_at on routing_rules;
create trigger trg_routing_rules_updated_at
before update on routing_rules
for each row execute function set_updated_at();

create index if not exists idx_routing_rules_active on routing_rules (status, priority asc);
create index if not exists idx_routing_rules_country on routing_rules (country_id);
create index if not exists idx_routing_rules_operator on routing_rules (operator_id);

-- ---------------------------------------------------------------------------
-- Routing decision logs
-- ---------------------------------------------------------------------------
create table if not exists routing_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_id text,
  country_id text,
  operator_id text,
  product_id text,
  provider_id uuid references lcr_providers (id) on delete set null,
  routing_type text not null check (routing_type in ('RULE', 'LCR')),
  provider_cost numeric,
  fallback_used boolean not null default false,
  status text not null default 'SELECTED',
  created_at timestamptz not null default now()
);

create index if not exists idx_routing_logs_created on routing_logs (created_at desc);
create index if not exists idx_routing_logs_country on routing_logs (country_id);
create index if not exists idx_routing_logs_operator on routing_logs (operator_id);
create index if not exists idx_routing_logs_provider on routing_logs (provider_id);
create index if not exists idx_routing_logs_transaction on routing_logs (transaction_id);

alter table lcr_engine_settings enable row level security;
alter table provider_priorities enable row level security;
alter table routing_rules enable row level security;
alter table routing_logs enable row level security;
