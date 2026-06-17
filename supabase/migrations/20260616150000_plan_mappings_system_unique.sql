-- plan_mappings: one row per provider raw plan → system plan (upsert-safe on sync)

alter table if exists plan_mappings
  drop constraint if exists plan_mappings_service_provider_id_provider_plan_raw_id_key;

alter table if exists plan_mappings
  drop constraint if exists plan_mappings_provider_plan_id_unique;

alter table if exists plan_mappings
  drop constraint if exists plan_mappings_provider_system_unique;

alter table if exists plan_mappings
  add constraint plan_mappings_provider_system_unique
  unique (service_provider_id, provider_plan_raw_id, system_plan_id);

create index if not exists idx_plan_mappings_provider_plan_id
  on plan_mappings (service_provider_id, provider_plan_id);
