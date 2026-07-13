-- Persist checkout summary pricing + routing snapshot on recharge_orders
-- so admin "Recharge Details" matches the summary page at recharge time.

alter table public.recharge_orders
  add column if not exists plan_price numeric,
  add column if not exists plan_price_currency text,
  add column if not exists service_fee_currency text,
  add column if not exists tax_currency text,
  add column if not exists total_payable numeric,
  add column if not exists payment_currency text,
  add column if not exists provider_cost numeric,
  add column if not exists provider_cost_currency text,
  add column if not exists routing_type text;

comment on column public.recharge_orders.plan_price is 'Plan MRP / recharge face value shown on summary page';
comment on column public.recharge_orders.plan_price_currency is 'Currency of plan_price (recharge / destination currency)';
comment on column public.recharge_orders.total_payable is 'Final amount charged to customer after FX / wallet / rewards';
comment on column public.recharge_orders.payment_currency is 'Currency of total_payable (actual payment currency)';
comment on column public.recharge_orders.provider_cost is 'Selected provider wholesale cost at checkout';
comment on column public.recharge_orders.provider_cost_currency is 'Currency of provider_cost';
comment on column public.recharge_orders.routing_type is 'RULE or LCR selected at pre-payment';

-- Backfill from existing columns / metadata where possible
update public.recharge_orders
set
  plan_price = coalesce(
    plan_price,
    nullif((metadata->>'plan_price')::numeric, 0),
    greatest(coalesce(send_amount, 0) - coalesce(service_fee, 0) - coalesce(tax, 0), 0)
  ),
  plan_price_currency = coalesce(
    nullif(plan_price_currency, ''),
    nullif(metadata->>'plan_price_currency', ''),
    nullif(metadata->>'recharge_currency', ''),
    send_currency
  ),
  service_fee_currency = coalesce(
    nullif(service_fee_currency, ''),
    nullif(metadata->>'service_fee_currency', ''),
    send_currency
  ),
  tax_currency = coalesce(
    nullif(tax_currency, ''),
    nullif(metadata->>'tax_currency', ''),
    send_currency
  ),
  total_payable = coalesce(
    total_payable,
    nullif((metadata->>'total_payable')::numeric, 0),
    nullif((metadata->>'user_pay_amount')::numeric, 0),
    send_amount
  ),
  payment_currency = coalesce(
    nullif(payment_currency, ''),
    nullif(metadata->>'payment_currency', ''),
    send_currency
  ),
  provider_cost = coalesce(
    provider_cost,
    nullif((metadata->>'provider_cost')::numeric, 0),
    receive_amount
  ),
  provider_cost_currency = coalesce(
    nullif(provider_cost_currency, ''),
    nullif(metadata->>'provider_cost_currency', ''),
    receive_currency
  ),
  routing_type = coalesce(
    nullif(routing_type, ''),
    nullif(metadata->>'routing_type', '')
  )
where true;
