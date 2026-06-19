-- Stable plan_mappings identity: one mapping per provider plan + system plan.

create unique index if not exists idx_plan_mappings_provider_plan_system_unique
  on plan_mappings (service_provider_id, provider_plan_id, system_plan_id)
  where provider_plan_id is not null and provider_plan_id <> '';
