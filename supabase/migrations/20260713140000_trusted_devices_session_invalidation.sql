-- Trusted devices metadata + force-logout support for admin security panel

alter table trusted_devices add column if not exists last_ip text;
alter table trusted_devices add column if not exists last_country text;
alter table trusted_devices add column if not exists device_info text;

-- Deduplicate before unique index (keep newest last_login_at / created_at)
delete from trusted_devices a
using trusted_devices b
where a.user_id = b.user_id
  and a.device_fingerprint = b.device_fingerprint
  and a.id < b.id;

-- Prevent duplicate fingerprints per user (needed for upserts)
create unique index if not exists trusted_devices_user_fingerprint_uidx
  on trusted_devices (user_id, device_fingerprint);

-- Tokens issued before this timestamp are treated as logged out
alter table profiles add column if not exists auth_sessions_invalidated_at timestamptz;
