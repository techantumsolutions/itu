-- Repair: admin_activity_logs migration was applied but table missing locally.
CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  admin_email text NOT NULL,
  action text NOT NULL,
  page_name text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON public.admin_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_id ON public.admin_activity_logs (admin_id);

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_activity_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_activity_logs TO authenticated;
GRANT SELECT ON public.admin_activity_logs TO anon;
