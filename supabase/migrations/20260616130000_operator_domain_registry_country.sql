-- Add country scope to operator_domain_registry for per-country filtering and matching.

alter table if exists operator_domain_registry
  add column if not exists country_iso3 text;

-- Legacy global rows (no country) are replaced on next telecom:seed-registry run.
delete from operator_domain_registry where country_iso3 is null;

alter table operator_domain_registry
  drop constraint if exists operator_domain_registry_normalized_name_operator_domain_key;

alter table operator_domain_registry
  alter column country_iso3 set not null;

create unique index if not exists idx_operator_domain_registry_country_name_domain
  on operator_domain_registry (country_iso3, normalized_name, operator_domain);

create index if not exists idx_operator_domain_registry_country
  on operator_domain_registry (country_iso3, operator_domain, normalized_name);

drop index if exists idx_operator_domain_registry_name;
