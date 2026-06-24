-- PostgREST (service_role) needs table-level grants on app_settings.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT SELECT ON public.app_settings TO anon;
