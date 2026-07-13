-- Split service fee into platform + payment gateway; store FX rate used at checkout.

alter table public.recharge_orders
  add column if not exists platform_fee numeric default 0,
  add column if not exists payment_gateway_fee numeric default 0,
  add column if not exists fx_rate numeric,
  add column if not exists fx_from_currency text,
  add column if not exists fx_to_currency text;

comment on column public.recharge_orders.platform_fee is 'Platform fee amount at recharge time (recharge currency)';
comment on column public.recharge_orders.payment_gateway_fee is 'Payment gateway fee amount at recharge time (recharge currency)';
comment on column public.recharge_orders.fx_rate is 'FX rate used at checkout: 1 fx_from_currency = fx_rate fx_to_currency';
comment on column public.recharge_orders.fx_from_currency is 'Source currency for fx_rate (usually recharge/plan currency)';
comment on column public.recharge_orders.fx_to_currency is 'Target currency for fx_rate (usually payment currency)';

-- Backfill from metadata / combined service_fee when possible
update public.recharge_orders
set
  platform_fee = coalesce(
    nullif(platform_fee, 0),
    nullif((metadata->>'platform_fee')::numeric, 0),
    0
  ),
  payment_gateway_fee = coalesce(
    nullif(payment_gateway_fee, 0),
    nullif((metadata->>'payment_gateway_fee')::numeric, 0),
    0
  ),
  fx_rate = coalesce(
    fx_rate,
    nullif((metadata->>'fx_rate')::numeric, 0),
    nullif((metadata->>'checkout_fx_rate')::numeric, 0)
  ),
  fx_from_currency = coalesce(
    nullif(fx_from_currency, ''),
    nullif(metadata->>'fx_from_currency', ''),
    nullif(metadata->>'recharge_currency', ''),
    plan_price_currency,
    send_currency
  ),
  fx_to_currency = coalesce(
    nullif(fx_to_currency, ''),
    nullif(metadata->>'fx_to_currency', ''),
    nullif(metadata->>'payment_currency', ''),
    payment_currency,
    send_currency
  )
where true;

-- If only combined service_fee exists and split is still zero, keep service_fee as-is
-- (admin UI will show platform/gateway when available, else combined service fee).
