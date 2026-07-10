-- Create careers_jobs table
create table if not exists careers_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null,
  description text not null,
  locations jsonb not null default '[]'::jsonb,
  experience text not null,
  type text not null,
  budget text not null,
  responsibilities jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  optional_skills jsonb not null default '[]'::jsonb,
  what_we_offer jsonb not null default '[]'::jsonb,
  jd_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create careers_applications table
create table if not exists careers_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references careers_jobs(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  cover_letter text,
  resume_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table careers_jobs enable row level security;
alter table careers_applications enable row level security;

-- Setup basic index on foreign key
create index if not exists idx_careers_applications_job_id on careers_applications(job_id);
create index if not exists idx_careers_jobs_created_at on careers_jobs(created_at desc);
create index if not exists idx_careers_applications_created_at on careers_applications(created_at desc);

grant all on table public.careers_jobs to postgres, service_role, authenticated, anon;
grant all on table public.careers_applications to postgres, service_role, authenticated, anon;
