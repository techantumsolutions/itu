-- Atomic admin wallet refund: row lock + single fulfillment + idempotent retries.
-- Replaces multi-step PostgREST refund that could double-credit under concurrency.

-- One completed/pending refund row per source transaction (belt-and-suspenders with FOR UPDATE).
DELETE FROM refunds a
USING refunds b
WHERE a.transaction_id IS NOT NULL
  AND a.transaction_id = b.transaction_id
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_transaction_id_unique
  ON refunds (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION admin_process_wallet_refund(
  p_transaction_id uuid,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_txn              transactions%ROWTYPE;
  v_ro_failed        boolean;
  v_was_tx_failed    boolean;
  v_reason           text;
  v_refund_tx_id     uuid;
  v_refund_id        uuid;
  v_existing_refund  refunds%ROWTYPE;
  v_meta             jsonb;
BEGIN
  IF p_transaction_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MISSING_ID',
      'error', 'Transaction ID is required'
    );
  END IF;

  -- Serialize concurrent admins / double-clicks on this transaction.
  SELECT * INTO v_txn
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_FOUND',
      'error', 'Transaction not found'
    );
  END IF;

  -- Idempotent success: already refunded (retry / concurrent loser after lock).
  IF v_txn.status = 'refunded' THEN
    SELECT * INTO v_existing_refund
    FROM refunds
    WHERE transaction_id = p_transaction_id
    ORDER BY created_at ASC
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'code', 'ALREADY_REFUNDED',
      'transaction_id', p_transaction_id,
      'refund_id', v_existing_refund.id,
      'refund_transaction_id', v_existing_refund.metadata->>'refund_transaction_id',
      'message', 'Transaction has already been refunded'
    );
  END IF;

  IF v_txn.type IS DISTINCT FROM 'recharge' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_TYPE',
      'error', 'Only recharge transactions can be refunded'
    );
  END IF;

  IF v_txn.user_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NO_USER',
      'error', 'Transaction is not linked to a user profile'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM recharge_orders
    WHERE transaction_id = p_transaction_id
      AND status = 'failed'
  ) INTO v_ro_failed;

  v_was_tx_failed := (v_txn.status = 'failed');

  IF NOT v_was_tx_failed AND NOT v_ro_failed THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ELIGIBLE',
      'error',
        'Refund is only allowed when the recharge delivery failed. This transaction and its recharge order are not in a failed state.'
    );
  END IF;

  v_reason := CASE
    WHEN v_was_tx_failed THEN
      format('Refund for failed recharge transaction (Tx ID: %s)', p_transaction_id)
    ELSE
      format(
        'Refund for failed recharge delivery — payment was captured but top-up was not delivered (Tx ID: %s)',
        p_transaction_id
      )
  END;

  -- Single fulfillment claim while holding the row lock.
  UPDATE transactions
  SET status = 'refunded'
  WHERE id = p_transaction_id;

  UPDATE recharge_orders
  SET status = 'refunded'
  WHERE transaction_id = p_transaction_id
    AND status IS DISTINCT FROM 'refunded';

  v_meta := jsonb_build_object(
    'refund_of_transaction_id', p_transaction_id,
    'refund_type', 'wallet',
    'admin_user_id', p_admin_user_id
  );

  -- Wallet credit via existing app_update_wallet_balance trigger (type=refund, status=completed).
  INSERT INTO transactions (
    user_id,
    type,
    amount,
    currency,
    status,
    description,
    metadata
  )
  VALUES (
    v_txn.user_id,
    'refund',
    v_txn.amount,
    v_txn.currency,
    'completed',
    v_reason,
    v_meta
  )
  RETURNING id INTO v_refund_tx_id;

  INSERT INTO refunds (
    transaction_id,
    amount,
    currency,
    status,
    reason,
    metadata
  )
  VALUES (
    p_transaction_id,
    v_txn.amount,
    v_txn.currency,
    'completed',
    v_reason,
    jsonb_build_object(
      'refund_transaction_id', v_refund_tx_id,
      'refund_type', 'wallet',
      'admin_user_id', p_admin_user_id
    )
  )
  RETURNING id INTO v_refund_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'code', 'REFUNDED',
    'transaction_id', p_transaction_id,
    'refund_id', v_refund_id,
    'refund_transaction_id', v_refund_tx_id,
    'amount', v_txn.amount,
    'currency', v_txn.currency,
    'message', 'Refund credited to user wallet'
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Unique index on refunds.transaction_id: another session fulfilled first.
    SELECT * INTO v_existing_refund
    FROM refunds
    WHERE transaction_id = p_transaction_id
    ORDER BY created_at ASC
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'code', 'ALREADY_REFUNDED',
      'transaction_id', p_transaction_id,
      'refund_id', v_existing_refund.id,
      'refund_transaction_id', v_existing_refund.metadata->>'refund_transaction_id',
      'message', 'Transaction has already been refunded'
    );
END;
$$;

REVOKE ALL ON FUNCTION admin_process_wallet_refund(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_process_wallet_refund(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION admin_process_wallet_refund(uuid, uuid) TO postgres;
