-- plan_mappings: persist across Step2 provider_plans_raw refresh (self-healing via provider_plan_id)

alter table if exists plan_mappings
  alter column provider_plan_raw_id drop not null;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where rel.relname = 'plan_mappings'
      and con.contype = 'f'
      and att.attname = 'provider_plan_raw_id'
  loop
    execute format('alter table plan_mappings drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table if exists plan_mappings
  add constraint plan_mappings_provider_plan_raw_id_fkey
  foreign key (provider_plan_raw_id)
  references provider_plans_raw (id)
  on delete set null;

-- May already exist from 20260616190000_plan_mappings_provider_plan_identity.sql
create unique index if not exists idx_plan_mappings_provider_plan_system_unique
  on plan_mappings (service_provider_id, provider_plan_id, system_plan_id)
  where provider_plan_id is not null and provider_plan_id <> '';
