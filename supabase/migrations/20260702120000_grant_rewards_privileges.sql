-- PostgREST (service_role) needs table-level grants on rewards tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_ledger TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_ledger TO authenticated;

GRANT SELECT ON public.reward_accounts TO anon;
GRANT SELECT ON public.reward_rules TO anon;
GRANT SELECT ON public.reward_ledger TO anon;
