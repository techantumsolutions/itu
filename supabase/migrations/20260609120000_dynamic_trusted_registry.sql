-- Dynamic trust registry migrations

-- 1. Extend system_operators table
alter table system_operators add column if not exists telecom_confidence numeric(5,2) default 0;
alter table system_operators add column if not exists trust_level varchar(20) default 'UNKNOWN';
alter table system_operators add column if not exists is_verified_telecom boolean default false;
alter table system_operators add column if not exists verification_source varchar(50) default 'PROMOTION';
alter table system_operators add column if not exists verified_at timestamptz;

-- 2. Upgrade operator_aliases table
alter table operator_aliases rename column system_operator_id to canonical_operator_id;
alter table operator_aliases add column if not exists normalized_alias text;
alter table operator_aliases add column if not exists country_code text default '*';
alter table operator_aliases add column if not exists confidence_score numeric default 0;
alter table operator_aliases add column if not exists source text default 'MANUAL';
alter table operator_aliases add column if not exists updated_at timestamptz default now();

-- 3. Adjust constraints on operator_aliases
alter table operator_aliases drop constraint if exists operator_aliases_alias_name_key;
alter table operator_aliases drop constraint if exists operator_aliases_alias_name_country_unique;
alter table operator_aliases add constraint operator_aliases_alias_name_country_unique unique (alias_name, country_code);

-- 4. Alter operator_trust_registry table
alter table operator_trust_registry add column if not exists canonical_operator_id uuid references system_operators(id) on delete set null;
alter table operator_trust_registry add column if not exists trust_score numeric default 0;
alter table operator_trust_registry add column if not exists is_verified boolean default false;
alter table operator_trust_registry add column if not exists source text default 'HISTORICAL';
alter table operator_trust_registry add column if not exists provider_count int default 1;
alter table operator_trust_registry add column if not exists sync_count int default 1;
alter table operator_trust_registry add column if not exists first_seen_at timestamptz default now();
alter table operator_trust_registry add column if not exists last_seen_at timestamptz default now();

-- Update existing rows in operator_trust_registry to have baseline scores based on verified status
update operator_trust_registry set trust_score = 95, is_verified = true, source = 'HISTORICAL' where is_verified_telecom = true and trust_score = 0;

-- 5. Create operator_block_keywords table
create table if not exists operator_block_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  category text not null,
  severity text not null default 'HIGH',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed operator_block_keywords table
insert into operator_block_keywords (keyword, category, severity) values
  ('DTH', 'DTH', 'HIGH'),
  ('TV', 'DTH', 'HIGH'),
  ('SATELLITE', 'DTH', 'HIGH'),
  ('STB', 'DTH', 'HIGH'),
  ('BROADBAND', 'UTILITY', 'HIGH'),
  ('FIBER', 'UTILITY', 'HIGH'),
  ('FIBRE', 'UTILITY', 'HIGH'),
  ('FTTH', 'UTILITY', 'HIGH'),
  ('DSL', 'UTILITY', 'HIGH'),
  ('ISP', 'UTILITY', 'HIGH'),
  ('WIFI', 'UTILITY', 'HIGH'),
  ('HOTEL', 'TRAVEL', 'HIGH'),
  ('RESORT', 'TRAVEL', 'HIGH'),
  ('CAFE', 'FOOD', 'HIGH'),
  ('COFFEE', 'FOOD', 'HIGH'),
  ('RESTAURANT', 'FOOD', 'HIGH'),
  ('FOOD', 'FOOD', 'HIGH'),
  ('GAMING', 'GAMING', 'HIGH'),
  ('GAME', 'GAMING', 'HIGH'),
  ('STEAM', 'GAMING', 'HIGH'),
  ('XBOX', 'GAMING', 'HIGH'),
  ('PLAYSTATION', 'GAMING', 'HIGH'),
  ('NETFLIX', 'OTT', 'HIGH'),
  ('SPOTIFY', 'OTT', 'HIGH'),
  ('OTT', 'OTT', 'HIGH'),
  ('STREAMING', 'OTT', 'HIGH'),
  ('GIFT', 'GIFTCARD', 'HIGH'),
  ('GIFTCARD', 'GIFTCARD', 'HIGH'),
  ('VOUCHER', 'GIFTCARD', 'HIGH'),
  ('COUPON', 'GIFTCARD', 'HIGH'),
  ('WALLET', 'WALLET', 'HIGH'),
  ('PAYTM', 'WALLET', 'HIGH'),
  ('TRAVEL', 'TRAVEL', 'HIGH'),
  ('FLIGHT', 'TRAVEL', 'HIGH'),
  ('UBER', 'TRAVEL', 'HIGH'),
  ('OLA', 'TRAVEL', 'HIGH'),
  ('TAXI', 'TRAVEL', 'HIGH'),
  ('AMAZON', 'RETAIL', 'HIGH'),
  ('RETAIL', 'RETAIL', 'HIGH'),
  ('SHOPPING', 'RETAIL', 'HIGH'),
  ('ELECTRICITY', 'UTILITY', 'HIGH'),
  ('UTILITY', 'UTILITY', 'HIGH'),
  ('WATER', 'UTILITY', 'HIGH'),
  ('GAS', 'UTILITY', 'HIGH'),
  ('BILL', 'UTILITY', 'HIGH')
on conflict (keyword) do nothing;

-- 6. Create operator_history table
create table if not exists operator_history (
  id uuid primary key default gen_random_uuid(),
  canonical_operator_id uuid not null references system_operators(id) on delete cascade,
  provider_id uuid references lcr_providers(id) on delete set null,
  sync_count int not null default 0,
  telecom_plan_count int not null default 0,
  active_plan_count int not null default 0,
  promotion_count int not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (canonical_operator_id, provider_id)
);

-- 7. Create operator_trust_audit table
create table if not exists operator_trust_audit (
  id uuid primary key default gen_random_uuid(),
  operator_name text not null,
  country_code text,
  canonical_operator_id uuid references system_operators(id) on delete set null,
  trust_score numeric not null default 0,
  trust_level text not null,
  match_source text not null,
  reason_json jsonb not null default '{}'::jsonb,
  sync_run_id uuid,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table operator_block_keywords enable row level security;
alter table operator_history enable row level security;
alter table operator_trust_audit enable row level security;
