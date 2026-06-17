-- Global country-scoped mobile operator registry (MCC/MNC + curated telecom operators)

create table if not exists domain_operator_registry (
  id uuid primary key default gen_random_uuid(),
  country_iso3 text not null,
  operator_name text not null,
  normalized_name text not null,
  slug text not null,
  aliases_json jsonb not null default '[]'::jsonb,
  mcc text,
  mnc text,
  domain text not null default 'MOBILE',
  is_active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country_iso3, normalized_name)
);

create index if not exists idx_domain_operator_registry_country on domain_operator_registry (country_iso3, is_active);
create index if not exists idx_domain_operator_registry_normalized on domain_operator_registry (country_iso3, normalized_name);
create index if not exists idx_domain_operator_registry_slug on domain_operator_registry (slug);
create index if not exists idx_domain_operator_registry_aliases on domain_operator_registry using gin (aliases_json);

drop trigger if exists trg_domain_operator_registry_updated_at on domain_operator_registry;
create trigger trg_domain_operator_registry_updated_at
before update on domain_operator_registry
for each row execute function set_updated_at();

-- Extend domain audit logs for registry decisions
alter table if exists operator_domain_audit_logs add column if not exists country_iso3 text;
alter table if exists operator_domain_audit_logs add column if not exists registry_match boolean;
alter table if exists operator_domain_audit_logs add column if not exists match_method text;
alter table if exists operator_domain_audit_logs add column if not exists telecom_score numeric;
alter table if exists operator_domain_audit_logs add column if not exists decision text;

create index if not exists idx_operator_domain_audit_registry on operator_domain_audit_logs (registry_match, decision, created_at desc);

alter table domain_operator_registry enable row level security;
