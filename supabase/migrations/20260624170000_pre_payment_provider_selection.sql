-- Pre-payment provider selection: extend statuses and payment_orders columns.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending', 'pending_payment', 'processing', 'completed', 'failed', 'cancelled', 'refunded'));

ALTER TABLE recharge_orders DROP CONSTRAINT IF EXISTS recharge_orders_status_check;
ALTER TABLE recharge_orders ADD CONSTRAINT recharge_orders_status_check
  CHECK (status IN ('pending', 'pending_payment', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'provider_unavailable_after_payment'));

ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('created', 'pending_payment', 'paid', 'failed', 'refunded'));

ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS checkout_session_id uuid;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS pending_transaction_id uuid REFERENCES transactions (id) ON DELETE SET NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS lcr_attempt_id uuid REFERENCES lcr_v2_recharge_attempts (id) ON DELETE SET NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS selected_provider_id uuid REFERENCES lcr_providers (id) ON DELETE SET NULL;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS selected_provider_name text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS selected_provider_plan_id text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS selected_provider_cost numeric;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS selected_provider_currency text;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS routing_result jsonb;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS lcr_result jsonb;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS provider_selection_timestamp timestamptz;

CREATE INDEX IF NOT EXISTS idx_payment_orders_checkout_session ON payment_orders (checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_pending_txn ON payment_orders (pending_transaction_id);
