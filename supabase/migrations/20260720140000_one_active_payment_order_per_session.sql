-- One active (unpaid) payment_order per checkout session.
-- Prevents multi create-order → multi capture for the same prepare-checkout txn.

-- Expire duplicates first (keep newest created/pending_payment per session).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY checkout_session_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM payment_orders
  WHERE checkout_session_id IS NOT NULL
    AND status IN ('created', 'pending_payment')
)
UPDATE payment_orders po
SET status = 'failed',
    updated_at = now()
FROM ranked r
WHERE po.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_one_active_per_checkout_session
  ON payment_orders (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL
    AND status IN ('created', 'pending_payment');
