-- Additive: LCR v2 recharge attempts (idempotency, routing audit, status lookup).
-- Run after uti_lcr_schema.sql

create table if not exists lcr_v2_recharge_attempts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique,
  distributor_ref text not null unique,
  internal_plan_id uuid not null references internal_plans (id) on delete restrict,
  phone_number text not null,
  send_amount numeric,
  currency text,
  status text not null default 'pending', -- pending|processing|success|failed
  routing_decision jsonb not null default '{}'::jsonb,
  attempts jsonb not null default '[]'::jsonb,
  selected_provider_id uuid references lcr_providers (id) on delete set null,
  selected_provider_plan_id text,
  provider_adapter text,
  provider_ref text,
  provider_response jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lcr_v2_attempts_status on lcr_v2_recharge_attempts (status, created_at desc);
create index if not exists idx_lcr_v2_attempts_internal on lcr_v2_recharge_attempts (internal_plan_id);

drop trigger if exists trg_lcr_v2_recharge_attempts_updated_at on lcr_v2_recharge_attempts;
create trigger trg_lcr_v2_recharge_attempts_updated_at
before update on lcr_v2_recharge_attempts
for each row execute function set_updated_at();

alter table lcr_v2_recharge_attempts enable row level security;
