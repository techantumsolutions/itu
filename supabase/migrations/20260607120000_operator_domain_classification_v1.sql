-- Operator domain classification layer (extends catalog intelligence, backward compatible)

-- ---------------------------------------------------------------------------
-- Operator domain columns on staging + live operators
-- ---------------------------------------------------------------------------
alter table if exists agg_operators add column if not exists operator_domain text default 'UNKNOWN';
alter table if exists agg_operators add column if not exists operator_domain_confidence numeric default 0;
alter table if exists agg_operators add column if not exists domain_classification_source text;

alter table if exists system_operators add column if not exists operator_domain text default 'UNKNOWN';
alter table if exists system_operators add column if not exists operator_domain_confidence numeric default 0;
alter table if exists system_operators add column if not exists domain_classification_source text;

create index if not exists idx_system_operators_domain on system_operators (operator_domain, status);
create index if not exists idx_agg_operators_domain on agg_operators (operator_domain, status);

-- ---------------------------------------------------------------------------
-- Canonical operator domain registry
-- ---------------------------------------------------------------------------
create table if not exists operator_domain_registry (
  id uuid primary key default gen_random_uuid(),
  operator_name text not null,
  normalized_name text not null,
  operator_domain text not null,
  confidence numeric not null default 90,
  is_verified boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name, operator_domain)
);

create index if not exists idx_operator_domain_registry_name on operator_domain_registry (normalized_name);

-- ---------------------------------------------------------------------------
-- Non-telecom operator blocklist (immediate telecom exclusion)
-- ---------------------------------------------------------------------------
create table if not exists non_telecom_operator_registry (
  id uuid primary key default gen_random_uuid(),
  operator_name text not null,
  normalized_name text not null,
  operator_domain text not null,
  confidence numeric not null default 95,
  is_verified boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create index if not exists idx_non_telecom_operator_registry_name on non_telecom_operator_registry (normalized_name);

-- ---------------------------------------------------------------------------
-- Domain classification audit (production debugging)
-- ---------------------------------------------------------------------------
create table if not exists operator_domain_audit_logs (
  id uuid primary key default gen_random_uuid(),
  operator_id text,
  operator_name text,
  provider_code text,
  detected_domain text not null,
  confidence numeric not null default 0,
  classification_source text,
  matched_rules text[] not null default '{}'::text[],
  matched_keywords text[] not null default '{}'::text[],
  sync_run_id uuid,
  rejection_reason text,
  domain_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_operator_domain_audit_created on operator_domain_audit_logs (created_at desc);
create index if not exists idx_operator_domain_audit_operator on operator_domain_audit_logs (operator_id);

-- Seed non-telecom blocklist
insert into non_telecom_operator_registry (operator_name, normalized_name, operator_domain, confidence, is_verified)
values
  ('Cafe Coffee Day', 'CAFE COFFEE DAY', 'FOOD', 98, true),
  ('Hyatt Hotel', 'HYATT', 'TRAVEL', 98, true),
  ('Hyatt', 'HYATT', 'TRAVEL', 98, true),
  ('Assassin''s Creed', 'ASSASSINS CREED', 'GAMING', 98, true),
  ('Goddess of Victory', 'GODDESS OF VICTORY', 'GAMING', 98, true),
  ('Steam', 'STEAM', 'GAMING', 98, true),
  ('Netflix', 'NETFLIX', 'OTT', 98, true),
  ('Spotify', 'SPOTIFY', 'OTT', 98, true),
  ('Amazon', 'AMAZON', 'RETAIL', 98, true),
  ('Walmart', 'WALMART', 'RETAIL', 98, true),
  ('Uber', 'UBER', 'TRAVEL', 95, true),
  ('Crunchyroll', 'CRUNCHYROLL', 'OTT', 98, true),
  ('Disney', 'DISNEY', 'OTT', 95, true),
  ('Razer', 'RAZER', 'GAMING', 95, true),
  ('Xbox', 'XBOX', 'GAMING', 98, true),
  ('PlayStation', 'PLAYSTATION', 'GAMING', 98, true),
  ('Starbucks', 'STARBUCKS', 'FOOD', 98, true),
  ('Dominos', 'DOMINOS', 'FOOD', 98, true),
  ('McDonalds', 'MCDONALDS', 'FOOD', 98, true)
on conflict (normalized_name) do nothing;

-- Seed verified MOBILE domain registry (telecom operators)
insert into operator_domain_registry (operator_name, normalized_name, operator_domain, confidence, is_verified)
values
  ('Jio', 'JIO', 'MOBILE', 99, true),
  ('Joi', 'JOI', 'MOBILE', 99, true),
  ('Airtel', 'AIRTEL', 'MOBILE', 99, true),
  ('Vodafone', 'VODAFONE', 'MOBILE', 99, true),
  ('Vi', 'VI', 'MOBILE', 99, true),
  ('Idea', 'IDEA', 'MOBILE', 99, true),
  ('BSNL', 'BSNL', 'MOBILE', 99, true),
  ('MTNL', 'MTNL', 'MOBILE', 99, true),
  ('MTN', 'MTN', 'MOBILE', 98, true),
  ('Orange', 'ORANGE', 'MOBILE', 98, true),
  ('Claro', 'CLARO', 'MOBILE', 98, true),
  ('Globe', 'GLOBE', 'MOBILE', 98, true),
  ('Telkomsel', 'TELKOMSEL', 'MOBILE', 98, true),
  ('Safaricom', 'SAFARICOM', 'MOBILE', 98, true)
on conflict (normalized_name, operator_domain) do nothing;
