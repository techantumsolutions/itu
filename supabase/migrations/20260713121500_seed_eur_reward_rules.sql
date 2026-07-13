-- Migration: Seed default reward rules with EUR currency
INSERT INTO reward_rules (name, trigger, points, scope, is_active, currency)
VALUES 
  ('First Recharge Bonus', 'FIRST_RECHARGE', 100, '{}'::jsonb, true, 'EUR'),
  ('High Value Recharge (€10+)', 'MIN_AMOUNT', 50, '{"min_amount": 10}'::jsonb, true, 'EUR'),
  ('Loyalty Count Bonus (Every 3rd recharge)', 'RECHARGE_COUNT', 150, '{"recharge_count": 3}'::jsonb, true, 'EUR')
ON CONFLICT DO NOTHING;
