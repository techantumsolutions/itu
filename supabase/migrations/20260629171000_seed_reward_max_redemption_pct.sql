-- Seed default app setting for points redemption limit: max 50% of transaction amount
INSERT INTO app_settings (key, value, updated_at)
VALUES ('reward_max_redemption_percentage', '50'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
