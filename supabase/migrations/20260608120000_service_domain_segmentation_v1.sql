-- Early service domain segmentation at ingestion (extends operator_domain layer)

alter table if exists agg_operators add column if not exists service_domain text default 'UNKNOWN';
alter table if exists agg_operators add column if not exists service_domain_confidence numeric default 0;
alter table if exists agg_operators add column if not exists service_domain_source text;

alter table if exists agg_plans add column if not exists service_domain text default 'UNKNOWN';
alter table if exists agg_plans add column if not exists service_domain_confidence numeric default 0;
alter table if exists agg_plans add column if not exists service_domain_source text;

alter table if exists provider_plans_raw add column if not exists service_domain text default 'UNKNOWN';
alter table if exists provider_plans_raw add column if not exists service_domain_confidence numeric default 0;
alter table if exists provider_plans_raw add column if not exists service_domain_source text;

alter table if exists system_operators add column if not exists service_domain text default 'UNKNOWN';
alter table if exists system_operators add column if not exists service_domain_confidence numeric default 0;
alter table if exists system_operators add column if not exists service_domain_source text;

alter table if exists system_plans add column if not exists service_domain text default 'UNKNOWN';
alter table if exists system_plans add column if not exists service_domain_confidence numeric default 0;
alter table if exists system_plans add column if not exists service_domain_source text;

-- Backfill from operator_domain where present
update agg_operators set service_domain = operator_domain where service_domain = 'UNKNOWN' and operator_domain is not null and operator_domain <> 'UNKNOWN';
update system_operators set service_domain = operator_domain where service_domain = 'UNKNOWN' and operator_domain is not null and operator_domain <> 'UNKNOWN';

create index if not exists idx_agg_operators_service_domain on agg_operators (service_domain, status);
create index if not exists idx_agg_plans_service_domain on agg_plans (service_domain, status);
create index if not exists idx_provider_plans_raw_service_domain on provider_plans_raw (service_domain);
create index if not exists idx_system_operators_service_domain on system_operators (service_domain, status);
create index if not exists idx_system_plans_service_domain on system_plans (service_domain, status);
