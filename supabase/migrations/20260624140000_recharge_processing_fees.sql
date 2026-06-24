-- Recharge checkout fee components (tax, platform, payment gateway) in app_settings.
INSERT INTO app_settings (key, value, updated_at)
VALUES (
  'recharge_processing_fees',
  jsonb_build_object(
    'tax', 0,
    'platform_fee', 0.49,
    'payment_gateway_fee', 0,
    'currency', 'INR'
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;
