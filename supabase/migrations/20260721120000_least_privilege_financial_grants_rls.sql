-- =============================================================================
-- Least-privilege financial / operational DB access
--
-- Context:
--   Prior migrations granted ALL (or broad DML) on money tables to `anon` and
--   `authenticated`. The Next.js backend uses the Supabase service_role key only
--   (lib/db/supabase-rest.ts). Client roles must not be able to mutate ledgers
--   via PostgREST even if RLS is misconfigured later.
--
-- Guarantees:
--   - service_role retains full DML (and bypasses RLS in Supabase) — no app
--     code changes required.
--   - anon / authenticated lose table privileges on financial tables.
--   - RLS enabled (deny-by-default; no client policies created).
--   - No ALTER DEFAULT PRIVILEGES were found in-repo; none are introduced here
--     that would re-grant to anon.
-- =============================================================================

-- Roles that must never hold direct DML on financial ledgers via PostgREST.
-- (service_role + postgres remain trusted.)

CREATE OR REPLACE FUNCTION public._itu_lockdown_table(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Defense in depth: RLS on, no client policies → deny for non-bypass roles.
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);

  -- Strip any prior overly-broad grants (including PUBLIC).
  EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', p_table);
  EXECUTE format('REVOKE ALL ON TABLE %s FROM anon', p_table);
  EXECUTE format('REVOKE ALL ON TABLE %s FROM authenticated', p_table);

  -- Explicit least privilege for the application backend.
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %s TO service_role',
    p_table
  );
  -- Keep postgres/supabase_admin fully privileged for migrations / console.
  EXECUTE format('GRANT ALL ON TABLE %s TO postgres', p_table);
END;
$$;

DO $$
DECLARE
  t text;
  financial_tables text[] := ARRAY[
    -- Core money / wallet
    'wallets',
    'wallet_ledger',
    'transactions',
    'payment_orders',
    'transaction_payments',
    'payment_events',
    'recharge_orders',
    'refunds',
    'lcr_v2_recharge_attempts',
    -- Rewards ledger (financial)
    'reward_accounts',
    'reward_ledger',
    'reward_rules',
    -- Reconciliation / settlement
    'reconciliation_reports',
    'reconciliation_items',
    'reconciliation_discrepancies',
    -- Provider pricing / credentials (never client-writable)
    'provider_credentials',
    'plan_mappings',
    'internal_plan_provider_mapping',
    'operator_mappings',
    'provider_priorities',
    'lcr_engine_settings'
  ];
BEGIN
  FOREACH t IN ARRAY financial_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      PERFORM public._itu_lockdown_table(('public.' || t)::regclass);
      RAISE NOTICE 'locked down public.%', t;
    ELSE
      RAISE NOTICE 'skip missing public.%', t;
    END IF;
  END LOOP;
END $$;

-- Sequences: prior migration granted ALL sequences in public to anon/authenticated.
-- Financial tables mostly use gen_random_uuid(); still revoke broad sequence grants.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- Future objects: do NOT default-grant to anon/authenticated.
-- Apply for common migration owner roles used by Supabase.
DO $$
DECLARE
  owner_role text;
BEGIN
  FOREACH owner_role IN ARRAY ARRAY['postgres', 'supabase_admin', current_user] LOOP
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated',
        owner_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role',
        owner_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated',
        owner_role
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role',
        owner_role
      );
    EXCEPTION
      WHEN undefined_object THEN
        RAISE NOTICE 'skip default privileges for missing role %', owner_role;
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'skip default privileges (insufficient privilege) for role %', owner_role;
    END;
  END LOOP;
END $$;

-- Refund RPC must remain service_role-only (re-assert).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_process_wallet_refund'
  ) THEN
    REVOKE ALL ON FUNCTION public.admin_process_wallet_refund(uuid, uuid) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.admin_process_wallet_refund(uuid, uuid) FROM anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.admin_process_wallet_refund(uuid, uuid) TO service_role;
    GRANT EXECUTE ON FUNCTION public.admin_process_wallet_refund(uuid, uuid) TO postgres;
  END IF;
END $$;

-- Helper is migration-only; drop so it is not a permanent API surface.
DROP FUNCTION IF EXISTS public._itu_lockdown_table(regclass);
