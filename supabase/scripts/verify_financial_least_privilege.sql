-- Execution verification after 20260721120000_least_privilege_financial_grants_rls.sql
-- Run as a privileged DB role (postgres / supabase_admin).
-- Expect: zero rows from "anon_or_auth_privileges" and "missing_rls".

-- 1) Privileges held by anon / authenticated on financial tables (must be empty)
WITH financial(table_name) AS (
  VALUES
    ('wallets'),
    ('wallet_ledger'),
    ('transactions'),
    ('payment_orders'),
    ('transaction_payments'),
    ('payment_events'),
    ('recharge_orders'),
    ('refunds'),
    ('lcr_v2_recharge_attempts'),
    ('reward_accounts'),
    ('reward_ledger'),
    ('reward_rules'),
    ('reconciliation_reports'),
    ('reconciliation_items'),
    ('reconciliation_discrepancies'),
    ('provider_credentials'),
    ('plan_mappings'),
    ('internal_plan_provider_mapping'),
    ('operator_mappings'),
    ('provider_priorities'),
    ('lcr_engine_settings')
)
SELECT
  c.relname AS table_name,
  grantee,
  privilege_type
FROM information_schema.role_table_grants g
JOIN pg_class c ON c.relname = g.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
JOIN financial f ON f.table_name = g.table_name
WHERE g.table_schema = 'public'
  AND g.grantee IN ('anon', 'authenticated', 'PUBLIC')
ORDER BY 1, 2, 3;
-- Alias for operators: anon_or_auth_privileges (expect 0 rows)

-- 2) service_role must retain DML
WITH financial(table_name) AS (
  VALUES
    ('wallets'),
    ('wallet_ledger'),
    ('transactions'),
    ('payment_orders'),
    ('payment_events'),
    ('recharge_orders'),
    ('refunds'),
    ('lcr_v2_recharge_attempts')
),
need(priv) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
)
SELECT f.table_name, n.priv AS missing_privilege
FROM financial f
CROSS JOIN need n
WHERE to_regclass('public.' || f.table_name) IS NOT NULL
  AND NOT has_table_privilege('service_role', 'public.' || f.table_name, n.priv)
ORDER BY 1, 2;
-- Expect 0 rows

-- 3) RLS enabled on financial tables that exist
WITH financial(table_name) AS (
  VALUES
    ('wallets'),
    ('wallet_ledger'),
    ('transactions'),
    ('payment_orders'),
    ('transaction_payments'),
    ('payment_events'),
    ('recharge_orders'),
    ('refunds'),
    ('lcr_v2_recharge_attempts'),
    ('reward_accounts'),
    ('reward_ledger'),
    ('reconciliation_reports'),
    ('reconciliation_items'),
    ('plan_mappings'),
    ('provider_credentials')
)
SELECT f.table_name
FROM financial f
JOIN pg_class c ON c.relname = f.table_name
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind = 'r'
  AND NOT c.relrowsecurity;
-- Alias: missing_rls (expect 0 rows)

-- 4) No client policies on money tables (deny-by-default is intentional)
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'wallets', 'wallet_ledger', 'transactions', 'payment_orders',
    'payment_events', 'recharge_orders', 'refunds', 'lcr_v2_recharge_attempts',
    'reconciliation_reports', 'reconciliation_items'
  );
-- Expect 0 rows (service_role bypasses RLS)

-- 5) Probe simulation (optional; run with SET ROLE anon in a transaction you ROLLBACK)
-- BEGIN;
-- SET LOCAL ROLE anon;
-- SELECT count(*) FROM transactions;  -- must ERROR: permission denied
-- ROLLBACK;
