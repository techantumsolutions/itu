-- Create user_contacts table
create table if not exists user_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  phone text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, phone)
);

-- Enable RLS
alter table user_contacts enable row level security;

-- Create policies for RLS
create policy "Users can perform all actions on their own contacts"
  on user_contacts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Add trigger to set updated_at
drop trigger if exists trg_user_contacts_updated_at on user_contacts;
create trigger trg_user_contacts_updated_at before update on user_contacts for each row execute function app_set_updated_at();

-- Add privileges for service/anon/authenticated roles
GRANT ALL ON TABLE user_contacts TO postgres, service_role, authenticated, anon;
