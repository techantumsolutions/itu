create table if not exists trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_fingerprint text not null,
  device_name text,
  last_login_at timestamptz,
  created_at timestamptz default now()
);

alter table trusted_devices enable row level security;

create table if not exists login_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, -- nullable for failed logins with unknown email, but generally set
  email text,
  status text, -- 'success', 'failed', 'blocked', '2fa_required'
  ip_address text,
  country text,
  device_info text,
  created_at timestamptz default now()
);

alter table login_audit_logs enable row level security;

-- Add TOTP columns to profiles
alter table profiles add column if not exists totp_secret text;
alter table profiles add column if not exists totp_enabled boolean default false;
