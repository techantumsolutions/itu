-- Supplier Reconciliation Schema Additions

-- 1. Alter reconciliation_reports table to capture run metadata, settlement tracking, validation and financial stats
ALTER TABLE reconciliation_reports 
ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS file_name TEXT,
ADD COLUMN IF NOT EXISTS file_hash TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS file_url TEXT,
ADD COLUMN IF NOT EXISTS billing_period TEXT, 
ADD COLUMN IF NOT EXISTS billing_type TEXT CHECK (billing_type IN ('Original', 'Correction', 'Adjustment')),
ADD COLUMN IF NOT EXISTS run_version INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS settlement_status TEXT DEFAULT 'open' CHECK (settlement_status IN ('open', 'ready_for_settlement', 'settled')),
ADD COLUMN IF NOT EXISTS health_metrics JSONB NOT NULL DEFAULT '{
  "match_rate": 0,
  "auto_match_percent": 0,
  "manual_review_percent": 0,
  "average_confidence": 0,
  "processing_time_ms": 0,
  "supplier_accuracy": 100,
  "settlement_accuracy": 100
}'::jsonb,
ADD COLUMN IF NOT EXISTS validation_errors JSONB NOT NULL DEFAULT '{
  "file_errors": [],
  "missing_columns": [],
  "invalid_dates": [],
  "invalid_currencies": [],
  "duplicate_rows": [],
  "unsupported_providers": [],
  "invalid_mobiles": []
}'::jsonb,
ADD COLUMN IF NOT EXISTS summary_details JSONB NOT NULL DEFAULT '{
  "supplier_billed": 0,
  "platform_expected": 0,
  "cost_difference": 0,
  "refunds": 0,
  "net_settlement": 0
}'::jsonb,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Create reconciliation_items table
CREATE TABLE IF NOT EXISTS reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reconciliation_reports(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  
  -- Item configuration
  item_type TEXT DEFAULT 'recharge' CHECK (item_type IN ('recharge', 'adjustment', 'credit_note', 'debit_note')),
  confidence_score INT DEFAULT 0,
  matched_by TEXT,
  
  -- Supplier fields
  supplier_tx_id TEXT,
  supplier_ref TEXT,
  mobile TEXT,
  amount NUMERIC,
  currency TEXT,
  
  -- Calculated differences
  provider_cost NUMERIC,
  difference_amount NUMERIC DEFAULT 0,
  refund_amount NUMERIC DEFAULT 0,
  supplier_cost_difference NUMERIC DEFAULT 0,
  customer_amount_difference NUMERIC DEFAULT 0,
  
  -- Status fields
  status TEXT NOT NULL CHECK (
    status IN (
      'MATCHED', 'AMOUNT_MISMATCH', 'STATUS_MISMATCH', 'PROVIDER_MISMATCH', 
      'ROUTING_MISMATCH', 'PAYMENT_MISMATCH', 'CURRENCY_MISMATCH', 
      'MISSING_PLATFORM', 'MISSING_SUPPLIER', 'REFUND_REQUIRED', 
      'REFUND_PENDING', 'REFUND_COMPLETED', 'DUPLICATE_SUPPLIER_ROW', 
      'Adjustment', 'Credit', 'Debit', 'INVALID', 'MANUAL_REVIEW', 'RESOLVED'
    )
  ),
  reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('CLEAR', 'PENDING', 'UNCLEAR')),
  reconciliation_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  refund_status TEXT CHECK (refund_status IN ('required', 'pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Indexes for fast dashboard and report lookups
CREATE INDEX IF NOT EXISTS idx_recon_items_report_id ON reconciliation_items(report_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_status ON reconciliation_items(reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_recon_items_supplier_tx_id ON reconciliation_items(supplier_tx_id);
CREATE INDEX IF NOT EXISTS idx_recon_items_tx_id ON reconciliation_items(transaction_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE reconciliation_items ENABLE ROW LEVEL SECURITY;

-- 5. Set up updated_at trigger
DROP TRIGGER IF EXISTS trg_reconciliation_items_updated_at ON reconciliation_items;
CREATE TRIGGER trg_reconciliation_items_updated_at
BEFORE UPDATE ON reconciliation_items
FOR EACH ROW EXECUTE FUNCTION app_set_updated_at();
