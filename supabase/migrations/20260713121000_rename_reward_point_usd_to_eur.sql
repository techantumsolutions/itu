-- Migration: Rename reward_point_usd_value to reward_point_eur_value in app_settings
UPDATE app_settings
SET key = 'reward_point_eur_value'
WHERE key = 'reward_point_usd_value';

-- Ensure a default is seeded if no previous setting existed
INSERT INTO app_settings (key, value, updated_at)
VALUES ('reward_point_eur_value', '0.01'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
