-- Store recharge processing fees as percentages instead of flat currency amounts.
UPDATE app_settings
SET
  value = jsonb_build_object(
    'fee_type', 'percent',
    'tax_percent', 0,
    'platform_fee_percent', 2,
    'payment_gateway_fee_percent', 0
  ),
  updated_at = now()
WHERE key = 'recharge_processing_fees';

INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'recharge_processing_fees',
  jsonb_build_object(
    'fee_type', 'percent',
    'tax_percent', 0,
    'platform_fee_percent', 2,
    'payment_gateway_fee_percent', 0
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;
