-- Support ticket auto-answer bot Q&A + allow bot messages on ticket threads

CREATE TABLE IF NOT EXISTS support_bot_qa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('general', 'transaction', 'payment', 'recharge', 'account', 'other')),
  is_suggested boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_bot_qa_active_sort
  ON support_bot_qa (is_active, is_suggested, sort_order ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_bot_qa_category
  ON support_bot_qa (category) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_support_bot_qa_updated_at ON support_bot_qa;
CREATE TRIGGER trg_support_bot_qa_updated_at
  BEFORE UPDATE ON support_bot_qa
  FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();

ALTER TABLE support_bot_qa ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_bot_qa
  TO postgres, service_role, authenticated, anon;

-- Allow automated bot replies on ticket threads
ALTER TABLE ticket_messages DROP CONSTRAINT IF EXISTS ticket_messages_sender_type_check;
ALTER TABLE ticket_messages
  ADD CONSTRAINT ticket_messages_sender_type_check
  CHECK (sender_type IN ('admin', 'user', 'bot'));

-- Seed common transaction / recharge Q&A (idempotent via question match)
INSERT INTO support_bot_qa (question, answer, keywords, category, is_suggested, is_active, sort_order)
SELECT * FROM (VALUES
  (
    'Why is my recharge still pending?',
    'Recharges can take a few minutes depending on the operator. Check Account → Transactions for live status. If it stays pending for more than 30 minutes, open a ticket with the transaction ID and our team will investigate.',
    ARRAY['pending', 'recharge', 'status', 'waiting', 'processing'],
    'recharge',
    true,
    true,
    10
  ),
  (
    'My money was deducted but recharge failed',
    'If payment succeeded but the recharge failed, a refund is usually processed automatically to your original payment method or wallet within 3–7 business days. Share the transaction ID in a ticket if you need us to check the refund status.',
    ARRAY['deducted', 'failed', 'refund', 'money', 'charged', 'payment'],
    'transaction',
    true,
    true,
    20
  ),
  (
    'How do I raise a complaint for a transaction?',
    'Go to Account → Transactions, open the recharge (within 7 days), and choose Raise Ticket. You can also create a ticket from Account → Support Tickets and link the transaction there.',
    ARRAY['complaint', 'ticket', 'transaction', 'raise', 'report'],
    'transaction',
    true,
    true,
    30
  ),
  (
    'When will I get my refund?',
    'Successful refunds typically appear in 3–7 business days depending on your bank or card issuer. Wallet refunds are usually faster. Include your transaction ID if you want support to verify the refund.',
    ARRAY['refund', 'money back', 'credit', 'returned'],
    'payment',
    true,
    true,
    40
  ),
  (
    'I was charged twice for the same recharge',
    'Duplicate charges are uncommon but can happen if a payment is retried. Open a ticket with both transaction / payment references. We will verify with the gateway and refund any duplicate successful charge.',
    ARRAY['duplicate', 'twice', 'double', 'charged', 'payment'],
    'payment',
    false,
    true,
    50
  ),
  (
    'How long do operator deliveries take?',
    'Most prepaid recharges complete within a few minutes. Some operators may take longer during peak hours or maintenance. If delivery exceeds 30–60 minutes, raise a ticket with the transaction ID.',
    ARRAY['delivery', 'time', 'operator', 'how long', 'delay'],
    'recharge',
    false,
    true,
    60
  )
) AS seed(question, answer, keywords, category, is_suggested, is_active, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM support_bot_qa existing WHERE existing.question = seed.question
);
