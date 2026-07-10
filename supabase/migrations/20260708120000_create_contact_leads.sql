-- Create contact_leads table
create table if not exists contact_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  phone text,
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_leads_created_at on contact_leads (created_at desc);
create index if not exists idx_contact_leads_status on contact_leads (status);

-- Enable RLS
alter table contact_leads enable row level security;

grant all on table public.contact_leads to postgres, service_role, authenticated, anon;
