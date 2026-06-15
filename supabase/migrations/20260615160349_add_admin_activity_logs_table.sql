-- Create admin_activity_logs table
create table if not exists admin_activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles (id) on delete cascade,
  admin_email text not null,
  action text not null,
  page_name text not null,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Add indexes for query performance
create index if not exists idx_admin_activity_logs_created_at on admin_activity_logs (created_at desc);
create index if not exists idx_admin_activity_logs_admin_id on admin_activity_logs (admin_id);

-- Enable RLS
alter table admin_activity_logs enable row level security;
