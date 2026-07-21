-- ROLLBACK ONLY — do not apply in production.
-- Restores the pre-hardening GRANT posture from:
--   20260708130000_grant_reconciliation_permissions.sql
--   20260708140000_grant_operational_permissions.sql
--   20260701140000_create_wallets_schema.sql (wallet grants)
--   20260702120000_grant_rewards_privileges.sql
--
-- Prefer fixing forward. Use this only if the lockdown migration must be undone.

GRANT ALL ON TABLE reconciliation_reports TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE reconciliation_items TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE payment_events TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE transactions TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE recharge_orders TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE lcr_v2_recharge_attempts TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE refunds TO postgres, service_role, authenticated, anon;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, authenticated, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_ledger TO service_role, authenticated;
GRANT SELECT ON public.wallets TO anon;
GRANT SELECT ON public.wallet_ledger TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_accounts TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_rules TO service_role, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_ledger TO service_role, authenticated;
GRANT SELECT ON public.reward_accounts TO anon;
GRANT SELECT ON public.reward_rules TO anon;
GRANT SELECT ON public.reward_ledger TO anon;

-- Note: RLS remains enabled (safe). Rollback does not disable RLS.
