-- Additive: admin roles + per-feature permissions for limited admins.
-- Run after profiles_schema.sql

alter table profiles add column if not exists app_role text not null default 'user';
alter table profiles add column if not exists admin_permissions jsonb;

comment on column profiles.app_role is 'user | reseller | admin | super_admin';
comment on column profiles.admin_permissions is 'JSON map featureKey -> boolean; ignored when app_role = super_admin. NULL = legacy full admin (all features except staff).';

create index if not exists idx_profiles_app_role on profiles (app_role);

-- Canonical super admin (adjust email if your production owner differs)
update profiles
set app_role = 'super_admin', admin_permissions = null
where lower(trim(email)) = 'admin@itu.com';
