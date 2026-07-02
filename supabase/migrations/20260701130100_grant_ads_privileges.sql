-- PostgREST (service_role) needs table-level grants on ads tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_creatives TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_analytics TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_creatives TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_analytics TO authenticated;

GRANT SELECT ON public.ads_campaigns TO anon;
GRANT SELECT ON public.ads_creatives TO anon;
GRANT INSERT ON public.ads_analytics TO anon;
