// Core type definitions for the Supplier Reconciliation Module

export interface NormalizedSupplierRow {
  supplier: string;                    // DTOne | Ding | ValueTopup
  supplierTransactionId: string;       // Unique ID in supplier system
  providerReference: string | null;    // Operator reference or transaction token
  externalReference: string | null;    // Internal system distributor reference
  mobile: string;                      // Normalised MSISDN (digits only)
  operator: string;                    // Target operator/carrier identifier
  country: string;                     // ISO Country code
  customerAmount: number;              // Face value charged to customer
  supplierCost: number;                // Cost billed to platform by supplier
  currency: string;                    // Billed currency code (e.g. 'USD')
  transactionDate: string;             // ISO Date string
  status: string;                      // Completed | Failed | Processing
  raw: Record<string, unknown>;        // Unaltered raw row dictionary
}

export type ReconciliationItemStatus =
  | 'MATCHED'
  | 'AMOUNT_MISMATCH'
  | 'STATUS_MISMATCH'
  | 'PROVIDER_MISMATCH'
  | 'ROUTING_MISMATCH'
  | 'PAYMENT_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'MISSING_PLATFORM'
  | 'MISSING_SUPPLIER'
  | 'REFUND_REQUIRED'
  | 'REFUND_PENDING'
  | 'REFUND_COMPLETED'
  | 'DUPLICATE_SUPPLIER_ROW'
  | 'Adjustment'
  | 'Credit'
  | 'Debit'
  | 'INVALID'
  | 'MANUAL_REVIEW'
  | 'RESOLVED';

export type ReconciliationState = 'CLEAR' | 'PENDING' | 'UNCLEAR';

export interface ReconciliationReportSummary {
  supplier_billed: number;
  platform_expected: number;
  cost_difference: number;
  refunds: number;
  net_settlement: number;
}

export interface ReconciliationValidationErrors {
  file_errors: string[];
  missing_columns: string[];
  invalid_dates: string[];
  invalid_currencies: string[];
  duplicate_rows: string[];
  unsupported_providers: string[];
  invalid_mobiles: string[];
}

export interface ReconciliationHealthMetrics {
  match_rate: number;
  auto_match_percent: number;
  manual_review_percent: number;
  average_confidence: number;
  processing_time_ms: number;
  supplier_accuracy: number;
  settlement_accuracy: number;
}

export interface ReconciliationDetails {
  supplier_snapshot: {
    supplier_tx_id: string;
    supplier_ref: string | null;
    mobile: string;
    billed_amount: number;
    billed_currency: string;
    billed_status: string;
    timestamp: string;
  };
  platform_snapshot?: {
    transaction_id: string;
    order_id: string;
    payment_status: string;
    recharge_status: string;
    recorded_cost: number;
    recorded_currency: string;
    timestamp: string;
  };
  comparison: {
    status_match: boolean;
    amount_match: boolean;
    provider_match: boolean;
    currency_match: boolean;
  };
  timeline: Array<{
    timestamp: string;
    event: string;
  }>;
  financial: {
    difference_amount: number;
    refund_amount: number;
    supplier_cost_difference: number;
    customer_amount_difference: number;
  };
  recommendations: Array<{
    action: string;
    reason: string;
  }>;
  metadata: {
    confidence_score: number;
    matched_by: string | null;
  };
}

export interface RecommendationAction {
  action: 'refund' | 'resolve' | 'ignore' | 'none';
  status: 'pending_approval' | 'approved' | 'rejected' | 'executed';
  approved_by?: string;
  approved_at?: string;
  notes?: string;
}
