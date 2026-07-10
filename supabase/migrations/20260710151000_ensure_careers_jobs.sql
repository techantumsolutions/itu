-- Ensure careers jobs/applications tables exist with PostgREST grants
CREATE TABLE IF NOT EXISTS public.careers_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  department text NOT NULL,
  description text NOT NULL,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience text NOT NULL,
  type text NOT NULL,
  budget text NOT NULL,
  responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  optional_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  what_we_offer jsonb NOT NULL DEFAULT '[]'::jsonb,
  jd_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.careers_jobs ADD COLUMN IF NOT EXISTS about_role text;
ALTER TABLE public.careers_jobs ADD COLUMN IF NOT EXISTS contact_email text;

CREATE TABLE IF NOT EXISTS public.careers_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.careers_jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  cover_letter text,
  resume_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_careers_applications_job_id ON public.careers_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_careers_jobs_created_at ON public.careers_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_careers_applications_created_at ON public.careers_applications(created_at DESC);

ALTER TABLE public.careers_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.careers_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.careers_jobs OWNER TO postgres;
ALTER TABLE public.careers_applications OWNER TO postgres;

GRANT ALL ON TABLE public.careers_jobs TO postgres, service_role, authenticated, anon;
GRANT ALL ON TABLE public.careers_applications TO postgres, service_role, authenticated, anon;

NOTIFY pgrst, 'reload schema';
