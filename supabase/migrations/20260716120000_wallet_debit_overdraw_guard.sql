-- H2/H3: Prevent wallet overspending, concurrent double-spending, race conditions,
-- and negative balances.
--
-- This ONLY hardens the existing app_update_wallet_balance() trigger function.
-- No schema changes, no new tables, no CHECK constraint (deferred until historical
-- data is cleaned). Credits (topup/refund/commission) behave exactly as before.
--
-- The guard is a single atomic, row-locked conditional UPDATE:
--   UPDATE ... SET balance = balance + net_amount WHERE balance + net_amount >= 0
-- PostgreSQL takes a row lock for the duration of the UPDATE, so concurrent debits
-- are serialized and the balance can never go negative. If the guard rejects the
-- debit (insufficient funds / lost race), the function raises, which aborts the
-- transactions INSERT/UPDATE so the caller (verify / wallet checkout) can detect
-- the failure and refuse to call the provider.

CREATE OR REPLACE FUNCTION app_update_wallet_balance()
RETURNS TRIGGER AS $$
DECLARE
  w_id UUID;
  net_amount NUMERIC;
  updated_balance NUMERIC;
BEGIN
  -- We only act if status changes to 'completed'
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status <> 'completed') THEN
    IF NEW.user_id IS NOT NULL THEN
      -- Find or create wallet for the user
      INSERT INTO wallets (user_id, currency, balance)
      VALUES (NEW.user_id, NEW.currency, 0)
      ON CONFLICT (user_id, currency) DO UPDATE SET updated_at = now()
      RETURNING id INTO w_id;

      -- Determine net amount to add to wallet (credits are positive, debits are negative)
      IF NEW.type IN ('topup', 'refund', 'commission') THEN
        net_amount := NEW.amount;
      ELSIF NEW.type = 'payment' THEN
        net_amount := -NEW.amount;
      ELSE
        net_amount := 0;
      END IF;

      IF net_amount < 0 THEN
        -- Guarded debit: row-locked, atomic overdraw check. This is the ONLY
        -- change in behavior — a debit that would drive the balance below zero
        -- is rejected instead of silently creating a negative balance.
        UPDATE wallets
        SET balance = balance + net_amount,
            updated_at = now()
        WHERE id = w_id
          AND balance + net_amount >= 0
        RETURNING balance INTO updated_balance;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'INSUFFICIENT_WALLET_BALANCE'
            USING ERRCODE = 'check_violation',
                  DETAIL = format('wallet=%s requested_debit=%s currency=%s',
                                  w_id, ABS(net_amount), NEW.currency);
        END IF;

        INSERT INTO wallet_ledger (wallet_id, transaction_id, direction, amount, currency, balance_after, reason)
        VALUES (w_id, NEW.id, 'debit', ABS(net_amount), NEW.currency, updated_balance, NEW.description);

      ELSIF net_amount > 0 THEN
        -- Credits are unchanged.
        UPDATE wallets
        SET balance = balance + net_amount,
            updated_at = now()
        WHERE id = w_id
        RETURNING balance INTO updated_balance;

        INSERT INTO wallet_ledger (wallet_id, transaction_id, direction, amount, currency, balance_after, reason)
        VALUES (w_id, NEW.id, 'credit', ABS(net_amount), NEW.currency, updated_balance, NEW.description);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
