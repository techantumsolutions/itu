-- Migration: Seed default setting for minimum points balance required to redeem points
INSERT INTO app_settings (key, value, updated_at)
VALUES ('reward_min_balance_to_redeem', '0'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
