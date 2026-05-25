-- Optional reporting helpers for aggregator catalog (additive).
-- These queries/views do not change existing application flow.

-- 1) Plans by country (active/inactive)
-- Replace 'dtone' as needed.
-- 
-- select o.country_iso3, p.status, count(*) as plans
-- from agg_plans p
-- join agg_operators o on o.id = p.operator_id
-- where p.provider = 'dtone'
-- group by o.country_iso3, p.status
-- order by plans desc;

-- 2) Plans by operator
--
-- select o.country_iso3, o.name as operator_name, count(*) as plans
-- from agg_plans p
-- join agg_operators o on o.id = p.operator_id
-- where p.provider = 'dtone' and p.status = 'active'
-- group by o.country_iso3, o.name
-- order by plans desc
-- limit 100;

-- 3) Top tags distribution
--
-- select tag, count(*) as plans
-- from (
--   select unnest(tags) as tag
--   from agg_plans
--   where provider = 'dtone' and status = 'active'
-- ) t
-- group by tag
-- order by plans desc;

-- 4) Latest API errors (sync observability)
--
-- select created_at, endpoint, status, error
-- from agg_api_logs
-- where provider = 'dtone' and (status >= 400 or error is not null)
-- order by created_at desc
-- limit 100;

-- 5) Profit / sales reporting (requires persisted transactions)
-- -----------------------------------------------------------------
-- Top-up orders and payments are persisted via app_operational_schema.sql.
-- Compute profit like:
--
-- profit = charged_amount - wholesale_amount - fees
--
-- and roll up by country/operator/plan over a date range.

