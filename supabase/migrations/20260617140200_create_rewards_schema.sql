-- Create reward points, ledger, and rules schema
CREATE OR REPLACE FUNCTION app_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

CREATE TABLE IF NOT EXISTS reward_accounts (
  user_id uuid PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  points_balance int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reward_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger text NOT NULL,
  points int NOT NULL DEFAULT 0,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reward_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles (id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions (id) ON DELETE SET NULL,
  points int NOT NULL,
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_ledger_user_created ON reward_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_rules_trigger ON reward_rules (trigger);

DROP TRIGGER IF EXISTS trg_reward_accounts_updated_at ON reward_accounts;
CREATE TRIGGER trg_reward_accounts_updated_at BEFORE UPDATE ON reward_accounts FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

DROP TRIGGER IF EXISTS trg_reward_rules_updated_at ON reward_rules;
CREATE TRIGGER trg_reward_rules_updated_at BEFORE UPDATE ON reward_rules FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE reward_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_ledger ENABLE ROW LEVEL SECURITY;

-- Seed default app setting for points valuation: 1 point = 0.01 USD
INSERT INTO app_settings (key, value, updated_at)
VALUES ('reward_point_usd_value', '0.01'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- Seed default rules
INSERT INTO reward_rules (name, trigger, points, scope, is_active)
VALUES 
  ('First Recharge Bonus', 'FIRST_RECHARGE', 100, '{}'::jsonb, true),
  ('High Value Recharge ($10+)', 'MIN_AMOUNT', 50, '{"min_amount": 10}'::jsonb, true),
  ('Loyalty Count Bonus (Every 3rd recharge)', 'RECHARGE_COUNT', 150, '{"recharge_count": 3}'::jsonb, true)
ON CONFLICT DO NOTHING;
