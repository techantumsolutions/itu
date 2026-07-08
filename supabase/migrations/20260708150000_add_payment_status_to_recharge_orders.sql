-- Add payment_status column to recharge_orders
ALTER TABLE recharge_orders ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pending';

-- Grant permissions to make sure the API can write to this new column
GRANT ALL ON TABLE recharge_orders TO postgres, service_role, authenticated, anon;
