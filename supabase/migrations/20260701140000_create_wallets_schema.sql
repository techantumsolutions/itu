-- Wallet tables (from app_operational_schema.sql) were missing from migrations;
-- trigger migrations referenced wallets/wallet_ledger without creating them.

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'USD',
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency)
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.wallets (id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions (id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount numeric NOT NULL,
  currency text NOT NULL,
  balance_after numeric,
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_created ON public.wallet_ledger (wallet_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_updated_at
BEFORE UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transactions_wallet_id_fkey'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_wallet_id_fkey
      FOREIGN KEY (wallet_id) REFERENCES public.wallets (id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_ledger TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_ledger TO authenticated;
GRANT SELECT ON public.wallets TO anon;
GRANT SELECT ON public.wallet_ledger TO anon;
