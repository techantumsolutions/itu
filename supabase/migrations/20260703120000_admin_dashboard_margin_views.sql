-- Dashboard reporting views: margin-based revenue from completed recharges.

drop view if exists admin_dashboard_summary cascade;
drop view if exists admin_daily_sales cascade;
drop view if exists admin_top_products cascade;

create or replace view admin_dashboard_summary as
select
  count(*)::bigint as total_orders,
  count(*) filter (where ro.status = 'completed')::bigint as completed_orders,
  count(*) filter (where ro.status = 'failed')::bigint as failed_orders,
  count(*) filter (where ro.status in ('pending', 'processing'))::bigint as pending_orders,
  coalesce(
    sum(
      case
        when ro.status = 'completed' and t.amount is not null then
          greatest(
            0,
            t.amount::numeric - coalesce(
              nullif((t.metadata->>'selected_provider_cost')::numeric, 0),
              0
            )
          )
        else 0
      end
    ),
    0
  ) as total_revenue,
  coalesce(
    sum(
      case
        when ro.status = 'completed' and t.amount is not null then
          greatest(
            0,
            t.amount::numeric - coalesce(
              nullif((t.metadata->>'selected_provider_cost')::numeric, 0),
              0
            )
          )
        else 0
      end
    ),
    0
  ) as total_margin
from recharge_orders ro
left join transactions t on t.id = ro.transaction_id;

create or replace view admin_daily_sales as
select
  date_trunc('day', ro.created_at)::date as day,
  coalesce(t.currency, ro.send_currency, 'EUR') as currency,
  coalesce(sum(case when ro.status = 'completed' then t.amount else 0 end), 0) as revenue,
  coalesce(
    sum(
      case
        when ro.status = 'completed' and t.amount is not null then
          greatest(
            0,
            t.amount::numeric - coalesce(
              nullif((t.metadata->>'selected_provider_cost')::numeric, 0),
              0
            )
          )
        else 0
      end
    ),
    0
  ) as margin,
  count(*)::bigint as orders,
  count(*) filter (where ro.status = 'completed')::bigint as completed_orders
from recharge_orders ro
left join transactions t on t.id = ro.transaction_id
group by 1, 2;

create or replace view admin_top_products as
select
  coalesce(ro.product_name, ro.sku_code, 'Unknown') as product_name,
  coalesce(ro.operator_name, ro.operator_code, 'Unknown') as operator_name,
  count(*) filter (where ro.status = 'completed')::bigint as orders,
  coalesce(sum(case when ro.status = 'completed' then t.amount else 0 end), 0) as revenue,
  coalesce(
    sum(
      case
        when ro.status = 'completed' and t.amount is not null then
          greatest(
            0,
            t.amount::numeric - coalesce(
              nullif((t.metadata->>'selected_provider_cost')::numeric, 0),
              0
            )
          )
        else 0
      end
    ),
    0
  ) as margin,
  max(coalesce(t.currency, ro.send_currency, 'EUR')) as currency
from recharge_orders ro
left join transactions t on t.id = ro.transaction_id
group by 1, 2
order by margin desc, orders desc;
