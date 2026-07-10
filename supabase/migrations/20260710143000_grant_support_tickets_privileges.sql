-- Fix: support ticket tables exist but service_role has no privileges (PostgREST 42501).
-- Run this in Supabase Dashboard → SQL Editor (must succeed with no errors).

DO $$
BEGIN
  -- Ensure tables exist (no-op if already created)
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'support_tickets'
  ) THEN
    RAISE EXCEPTION 'public.support_tickets does not exist — create the support tickets schema first';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.support_tickets ADD COLUMN IF NOT EXISTS attachment_url text;

-- Re-assert ownership so GRANT can succeed
ALTER TABLE IF EXISTS public.support_tickets OWNER TO postgres;
ALTER TABLE IF EXISTS public.ticket_messages OWNER TO postgres;
ALTER TABLE IF EXISTS public.ticket_notes OWNER TO postgres;

GRANT ALL ON TABLE public.support_tickets TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE public.ticket_messages TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE public.ticket_notes TO postgres, service_role, authenticated, anon;

-- Verify (should return rows with grantee = service_role)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('support_tickets', 'ticket_messages', 'ticket_notes')
  AND grantee IN ('service_role', 'authenticated', 'anon')
ORDER BY table_name, grantee, privilege_type;
