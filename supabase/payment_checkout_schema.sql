-- Payment checkout schema: payment_orders + transaction_payments
-- Run after app_operational_schema.sql

create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,                -- razorpay_order_id
  payment_id text,                       -- razorpay_payment_id (set after verification)
  user_id uuid references profiles (id) on delete set null,
  plan_id text not null,
  mobile_number text not null,
  operator_id text,
  country_id text,
  amount numeric not null,
  currency text not null default 'INR',
  status text not null default 'created' check (status in ('created', 'paid', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transaction_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions (id) on delete set null,
  payment_order_id uuid references payment_orders (id) on delete set null,
  payment_gateway text not null default 'razorpay',
  gateway_reference text,
  amount numeric not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_orders_order_id on payment_orders (order_id);
create index if not exists idx_payment_orders_status on payment_orders (status, created_at desc);
create index if not exists idx_transaction_payments_transaction on transaction_payments (transaction_id);
create index if not exists idx_transaction_payments_payment_order on transaction_payments (payment_order_id);

alter table payment_orders enable row level security;
alter table transaction_payments enable row level security;

drop trigger if exists trg_payment_orders_updated_at on payment_orders;
create trigger trg_payment_orders_updated_at before update on payment_orders for each row execute function app_set_updated_at();
