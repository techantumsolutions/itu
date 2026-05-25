-- Additive operational schema: replaces runtime mock/static data with durable app tables.
-- Run after profiles_schema.sql, catalog_schema.sql, aggregator_catalog_schema.sql, and uti_lcr_v2_transactions.sql.

create extension if not exists pgcrypto;

create or replace function app_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  currency text not null default 'USD',
  balance numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, currency)
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  wallet_id uuid references wallets (id) on delete set null,
  type text not null check (type in ('topup', 'recharge', 'refund', 'commission', 'points_earned', 'points_redeemed', 'payment')),
  amount numeric not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references wallets (id) on delete cascade,
  transaction_id uuid references transactions (id) on delete set null,
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric not null,
  currency text not null,
  balance_after numeric,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  transaction_id uuid references transactions (id) on delete set null,
  provider text not null,
  provider_event_id text,
  provider_payment_id text,
  provider_order_id text,
  status text not null default 'pending',
  amount numeric,
  currency text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists refunds (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions (id) on delete set null,
  payment_event_id uuid references payment_events (id) on delete set null,
  amount numeric not null,
  currency text not null,
  status text not null default 'pending',
  reason text,
  provider_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recharge_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  transaction_id uuid references transactions (id) on delete set null,
  lcr_attempt_id uuid references lcr_v2_recharge_attempts (id) on delete set null,
  country_iso text,
  operator_code text,
  operator_name text,
  plan_id uuid,
  sku_code text,
  product_name text,
  phone_number text not null,
  send_amount numeric,
  send_currency text,
  receive_amount numeric,
  receive_currency text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
  provider text,
  provider_ref text,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete set null,
  user_email text not null default '',
  user_name text not null default '',
  transaction_id text,
  subject text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  sender_type text not null check (sender_type in ('admin', 'user')),
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists ticket_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  note text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  alt_text text,
  mime_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  placement text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  target_countries text[] not null default '{}',
  image_url text,
  link_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ad_events (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid references ads (id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'click')),
  user_id uuid references profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists user_preferences (
  user_id uuid primary key references profiles (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists notification_preferences (
  user_id uuid primary key references profiles (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists service_fee_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope jsonb not null default '{}'::jsonb,
  fee_type text not null check (fee_type in ('fixed', 'percent')),
  fee_value numeric not null default 0,
  currency text,
  is_active boolean not null default true,
  priority int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_limit_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope jsonb not null default '{}'::jsonb,
  min_amount numeric,
  max_amount numeric,
  currency text,
  period text,
  is_active boolean not null default true,
  priority int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed', 'percent')),
  discount_value numeric not null default 0,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions int,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,
  transaction_id uuid references transactions (id) on delete set null,
  discount_amount numeric,
  currency text,
  created_at timestamptz not null default now()
);

create table if not exists reward_accounts (
  user_id uuid primary key references profiles (id) on delete cascade,
  points_balance int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles (id) on delete cascade,
  transaction_id uuid references transactions (id) on delete set null,
  points int not null,
  reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reward_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger text not null,
  points int not null default 0,
  scope jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reconciliation_reports (
  id uuid primary key default gen_random_uuid(),
  provider text,
  period_start date,
  period_end date,
  status text not null default 'pending',
  totals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reconciliation_discrepancies (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reconciliation_reports (id) on delete cascade,
  transaction_id uuid references transactions (id) on delete set null,
  type text not null,
  status text not null default 'open',
  amount_delta numeric,
  currency text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_user_created on transactions (user_id, created_at desc);
create index if not exists idx_transactions_status_created on transactions (status, created_at desc);
create index if not exists idx_wallet_ledger_wallet_created on wallet_ledger (wallet_id, created_at desc);
create index if not exists idx_recharge_orders_user_created on recharge_orders (user_id, created_at desc);
create index if not exists idx_recharge_orders_status_created on recharge_orders (status, created_at desc);
create index if not exists idx_support_tickets_user_updated on support_tickets (user_id, updated_at desc);
create index if not exists idx_support_tickets_status_updated on support_tickets (status, updated_at desc);
create index if not exists idx_ticket_messages_ticket_created on ticket_messages (ticket_id, created_at);
create index if not exists idx_ticket_notes_ticket_created on ticket_notes (ticket_id, created_at);
create index if not exists idx_ads_status_placement on ads (status, placement);

drop trigger if exists trg_wallets_updated_at on wallets;
create trigger trg_wallets_updated_at before update on wallets for each row execute function app_set_updated_at();

drop trigger if exists trg_transactions_updated_at on transactions;
create trigger trg_transactions_updated_at before update on transactions for each row execute function app_set_updated_at();

drop trigger if exists trg_refunds_updated_at on refunds;
create trigger trg_refunds_updated_at before update on refunds for each row execute function app_set_updated_at();

drop trigger if exists trg_recharge_orders_updated_at on recharge_orders;
create trigger trg_recharge_orders_updated_at before update on recharge_orders for each row execute function app_set_updated_at();

drop trigger if exists trg_support_tickets_updated_at on support_tickets;
create trigger trg_support_tickets_updated_at before update on support_tickets for each row execute function app_set_updated_at();

drop trigger if exists trg_ads_updated_at on ads;
create trigger trg_ads_updated_at before update on ads for each row execute function app_set_updated_at();

drop trigger if exists trg_app_settings_updated_at on app_settings;
create trigger trg_app_settings_updated_at before update on app_settings for each row execute function app_set_updated_at();

drop trigger if exists trg_user_preferences_updated_at on user_preferences;
create trigger trg_user_preferences_updated_at before update on user_preferences for each row execute function app_set_updated_at();

drop trigger if exists trg_notification_preferences_updated_at on notification_preferences;
create trigger trg_notification_preferences_updated_at before update on notification_preferences for each row execute function app_set_updated_at();

drop trigger if exists trg_service_fee_rules_updated_at on service_fee_rules;
create trigger trg_service_fee_rules_updated_at before update on service_fee_rules for each row execute function app_set_updated_at();

drop trigger if exists trg_transaction_limit_rules_updated_at on transaction_limit_rules;
create trigger trg_transaction_limit_rules_updated_at before update on transaction_limit_rules for each row execute function app_set_updated_at();

drop trigger if exists trg_promo_codes_updated_at on promo_codes;
create trigger trg_promo_codes_updated_at before update on promo_codes for each row execute function app_set_updated_at();

drop trigger if exists trg_reward_accounts_updated_at on reward_accounts;
create trigger trg_reward_accounts_updated_at before update on reward_accounts for each row execute function app_set_updated_at();

drop trigger if exists trg_reward_rules_updated_at on reward_rules;
create trigger trg_reward_rules_updated_at before update on reward_rules for each row execute function app_set_updated_at();

drop trigger if exists trg_reconciliation_reports_updated_at on reconciliation_reports;
create trigger trg_reconciliation_reports_updated_at before update on reconciliation_reports for each row execute function app_set_updated_at();

drop trigger if exists trg_reconciliation_discrepancies_updated_at on reconciliation_discrepancies;
create trigger trg_reconciliation_discrepancies_updated_at before update on reconciliation_discrepancies for each row execute function app_set_updated_at();

create or replace view admin_dashboard_summary as
select
  coalesce(sum(case when status = 'completed' and type in ('topup', 'recharge', 'payment') then amount else 0 end), 0) as total_revenue,
  count(*) filter (where type in ('topup', 'recharge', 'payment')) as total_orders,
  count(*) filter (where status = 'completed') as completed_orders,
  count(*) filter (where status = 'failed') as failed_orders
from transactions;

create or replace view admin_daily_sales as
select
  date_trunc('day', created_at)::date as day,
  currency,
  coalesce(sum(case when status = 'completed' then amount else 0 end), 0) as revenue,
  count(*) as orders
from transactions
where type in ('topup', 'recharge', 'payment')
group by 1, 2;

create or replace view admin_top_products as
select
  coalesce(product_name, sku_code, 'Unknown') as product_name,
  coalesce(operator_name, operator_code, 'Unknown') as operator_name,
  count(*) as orders,
  coalesce(sum(send_amount), 0) as revenue,
  max(send_currency) as currency
from recharge_orders
group by 1, 2
order by orders desc, revenue desc;

create or replace view admin_customer_spend as
select
  p.id as user_id,
  p.email,
  p.name,
  coalesce(sum(case when t.status = 'completed' then t.amount else 0 end), 0) as total_spend,
  count(t.id) as transaction_count,
  max(t.created_at) as last_transaction_at
from profiles p
left join transactions t on t.user_id = p.id
group by p.id, p.email, p.name;

alter table wallets enable row level security;
alter table transactions enable row level security;
alter table wallet_ledger enable row level security;
alter table payment_events enable row level security;
alter table refunds enable row level security;
alter table recharge_orders enable row level security;
alter table support_tickets enable row level security;
alter table ticket_messages enable row level security;
alter table ticket_notes enable row level security;
alter table media_assets enable row level security;
alter table ads enable row level security;
alter table ad_events enable row level security;
alter table app_settings enable row level security;
alter table user_preferences enable row level security;
alter table notification_preferences enable row level security;
alter table service_fee_rules enable row level security;
alter table transaction_limit_rules enable row level security;
alter table promo_codes enable row level security;
alter table promo_redemptions enable row level security;
alter table reward_accounts enable row level security;
alter table reward_ledger enable row level security;
alter table reward_rules enable row level security;
alter table reconciliation_reports enable row level security;
alter table reconciliation_discrepancies enable row level security;
