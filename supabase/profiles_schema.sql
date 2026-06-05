-- Optional: store profile fields for Supabase Auth users.
-- Used by app/api/profile/locale and app/api/auth/register upsert.

create table if not exists profiles (
  id uuid primary key,
  email text,
  name text,
  phone text,
  country_code text,
  country text,
  language text,
  is_registered_with_email boolean default false,
  is_active boolean default true,
  image text,
  currency text,
  bio text,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

