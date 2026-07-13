-- Optional category on support tickets (used for in-chat suggestions)

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IN ('general', 'transaction', 'payment', 'recharge', 'account', 'other'));

CREATE INDEX IF NOT EXISTS idx_support_tickets_category
  ON support_tickets (category);
