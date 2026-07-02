-- PostgreSQL performance: LCR / catalog hot-path indexes
-- Targets: plan_mappings (sync), provider_plans_raw (sync upserts), stats refresh
-- Does not change schema constraints or application business logic.

-- plan_mappings: sync + step7/step8 filter by service_provider_id alone (was seq scan)
create index if not exists idx_plan_mappings_service_provider
  on public.plan_mappings (service_provider_id);

-- plan_mappings: covering index for provider-scoped sync selects of system_plan_id
create index if not exists idx_plan_mappings_service_provider_system_plan
  on public.plan_mappings (service_provider_id)
  include (system_plan_id, provider_plan_id, provider_plan_raw_id);

-- provider_plans_raw: remove unused indexes (0 idx_scan, ~38k+ upserts per sync window)
-- Verified via pg_stat_user_indexes on 2026-07-01; no application queries filter on these columns.
drop index if exists public.idx_provider_plans_raw_json_gin;
drop index if exists public.idx_provider_plans_raw_benefits;
drop index if exists public.idx_provider_plans_raw_checksum;
drop index if exists public.idx_provider_plans_raw_destination;
drop index if exists public.idx_provider_plans_raw_amount_currency;
drop index if exists public.idx_provider_plans_raw_plan_type;

-- Refresh planner statistics after index changes
analyze public.plan_mappings;
analyze public.lcr_providers;
analyze public.catalog_review_queue;
analyze public.provider_plans_raw;
