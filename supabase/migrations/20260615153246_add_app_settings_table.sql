-- Create trigger helper function if not exists
create or replace function app_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Create app_settings table
create table if not exists app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Apply updated_at trigger
drop trigger if exists trg_app_settings_updated_at on app_settings;
create trigger trg_app_settings_updated_at 
before update on app_settings 
for each row execute function app_set_updated_at();

-- Enable RLS
alter table app_settings enable row level security;
