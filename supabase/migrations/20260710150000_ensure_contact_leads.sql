-- Ensure contact_leads exists and is usable by PostgREST (service_role).
-- Fixes: PGRST205 Could not find the table 'public.contact_leads' in the schema cache

CREATE TABLE IF NOT EXISTS public.contact_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  phone text,
  message text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_leads_created_at ON public.contact_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_leads_status ON public.contact_leads (status);

ALTER TABLE public.contact_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_leads OWNER TO postgres;

GRANT ALL ON TABLE public.contact_leads TO postgres, service_role, authenticated, anon;

-- Notify PostgREST to reload schema cache (Supabase supports this)
NOTIFY pgrst, 'reload schema';
