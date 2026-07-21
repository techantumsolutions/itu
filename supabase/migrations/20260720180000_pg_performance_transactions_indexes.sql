-- Hot-path indexes for admin/list/report queries on transactions & recharge_orders.
-- These exist in app_operational_schema.sql but were missing from applied migrations.

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
  ON public.transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_status_created
  ON public.transactions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON public.transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recharge_orders_user_created
  ON public.recharge_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recharge_orders_status_created
  ON public.recharge_orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recharge_orders_created_at
  ON public.recharge_orders (created_at DESC);

-- Nested embed / join by transaction_id (admin TX, recon, refunds)
CREATE INDEX IF NOT EXISTS idx_recharge_orders_transaction_id
  ON public.recharge_orders (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recharge_orders_payment_status_created
  ON public.recharge_orders (payment_status, created_at DESC);
