-- Migration: Country Normalization and Deduplication DDL
-- Drops and recreates the empty legacy tables to use the new canonical countries primary key.

drop table if exists plans;
drop table if exists operators;
drop table if exists countries;

create table countries (
  id text primary key, -- stores uppercase canonical ISO3 code, e.g. 'MEX'
  name text not null,
  iso2 text not null,
  iso3 text not null,
  dial_prefix text not null default '',
  min_length int default 10,
  max_length int default 15,
  constraint countries_iso2_unique unique (iso2),
  constraint countries_iso3_unique unique (iso3),
  constraint countries_name_lower_unique unique (name)
);

create table operators (
  id uuid primary key default gen_random_uuid(),
  country_id text not null references countries (id) on delete cascade,
  code text not null,
  name text not null,
  short_name text,
  logo_url text,
  validation_regex text,
  region_code text,
  is_default boolean default false,
  unique (country_id, code)
);

create table plans (
  id uuid primary key default gen_random_uuid(),
  sku_code text not null unique,
  country_id text not null references countries (id) on delete cascade,
  operator_code text not null,
  price_inr numeric default 0,
  price_eur numeric default 0,
  validity text default '',
  plan_type text default 'topup',
  tag text default 'none',
  benefits text,
  data_label text,
  calls_label text,
  sms_label text,
  plan_name text,
  benefits_json jsonb default '[]'::jsonb,
  min_send_amount numeric,
  max_send_amount numeric,
  send_currency text default 'EUR',
  min_receive_amount numeric,
  max_receive_amount numeric,
  receive_currency text default 'INR',
  commission_rate numeric default 0,
  processing_mode text default 'Instant'
);

create index if not exists idx_operators_country on operators (country_id);
create index if not exists idx_plans_country_operator on plans (country_id, operator_code);

alter table countries enable row level security;
alter table operators enable row level security;
alter table plans enable row level security;
