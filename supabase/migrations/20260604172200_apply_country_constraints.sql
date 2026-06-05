-- Migration: Apply Country Constraints
-- Recreates system_operators slug/country unique constraint and adds country foreign key.

-- Recreate slug/country unique constraint
ALTER TABLE system_operators DROP CONSTRAINT IF EXISTS system_operators_slug_country_id_key;
ALTER TABLE system_operators ADD CONSTRAINT system_operators_slug_country_id_key UNIQUE (slug, country_id);

-- Add country foreign key referencing countries(id)
ALTER TABLE system_operators DROP CONSTRAINT IF EXISTS fk_system_operators_country;
ALTER TABLE system_operators ADD CONSTRAINT fk_system_operators_country FOREIGN KEY (country_id) REFERENCES countries(id);
