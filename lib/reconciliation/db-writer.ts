import { supabaseRest } from '../db/supabase-rest';
import { VerificationResult } from './pipeline/05-verification-engine';
import { 
  ReconciliationReportSummary, 
  ReconciliationValidationErrors, 
  ReconciliationHealthMetrics,
  ReconciliationState
} from './types';

export class DbWriter {
  /**
   * Inserts the report header and bulk-inserts all line items into Supabase.
   */
  async writeReport(params: {
    supplier: string;
    billingPeriod: string;
    periodStart: string;
    periodEnd: string;
    billingType: string;
    fileHash: string;
    fileName: string;
    fileUrl: string;
    uploadedBy: string;
    runVersion: number;
    summary: ReconciliationReportSummary;
    errors: ReconciliationValidationErrors;
    metrics: ReconciliationHealthMetrics;
    results: VerificationResult[];
    states: ReconciliationState[];
  }): Promise<string> {
    const {
      supplier,
      billingPeriod,
      periodStart,
      periodEnd,
      billingType,
      fileHash,
      fileName,
      fileUrl,
      uploadedBy,
      runVersion,
      summary,
      errors,
      metrics,
      results,
      states,
    } = params;

    // 1. Create Report Header
    const reportPayload = {
      provider: supplier,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'pending', // default run status is pending review
      totals: summary, // stores the summary payout details
      summary_details: summary,
      validation_errors: errors,
      health_metrics: metrics,
      uploaded_by: uploadedBy || null,
      file_name: fileName,
      file_hash: fileHash,
      file_url: fileUrl,
      billing_period: billingPeriod,
      billing_type: billingType,
      run_version: runVersion,
      settlement_status: 'open',
    };

    const headerRes = await supabaseRest('reconciliation_reports', {
      method: 'POST',
      body: JSON.stringify(reportPayload),
      headers: {
        Prefer: 'return=representation',
      },
    });

    if (!headerRes.ok) {
      const errText = await headerRes.text();
      throw new Error(`Failed to create reconciliation report header: ${errText}`);
    }

    const createdHeaders = await headerRes.json();
    const reportId = createdHeaders?.[0]?.id;
    if (!reportId) {
      throw new Error('Failed to retrieve created reconciliation report ID.');
    }

    // 2. Map verification results into bulk items array
    const itemsPayload = results.map((r, i) => {
      const itemState = states[i];
      const supplierSnap = r.details.supplier_snapshot;
      const ro = r.matchedTx?.recharge_orders?.[0] ?? null;

      // Determine item type
      let itemType: 'recharge' | 'adjustment' | 'credit_note' | 'debit_note' = 'recharge';
      const desc = (r.details.supplier_snapshot.supplier_ref || '').toLowerCase();
      if (desc.includes('credit')) itemType = 'credit_note';
      else if (desc.includes('debit')) itemType = 'debit_note';
      else if (desc.includes('adjust')) itemType = 'adjustment';

      // Map status
      let itemStatus = r.status;
      if (itemType === 'adjustment') itemStatus = 'Adjustment';
      else if (itemType === 'credit_note') itemStatus = 'Credit';
      else if (itemType === 'debit_note') itemStatus = 'Debit';

      return {
        report_id: reportId,
        transaction_id: r.matchedTx?.id || null,
        item_type: itemType,
        confidence_score: r.confidenceScore,
        matched_by: r.matchedBy,
        supplier_tx_id: supplierSnap.supplier_tx_id,
        supplier_ref: supplierSnap.supplier_ref,
        mobile: supplierSnap.mobile,
        amount: supplierSnap.billed_amount,
        currency: supplierSnap.billed_currency,
        provider_cost: r.details.platform_snapshot?.recorded_cost || null,
        difference_amount: r.details.financial.difference_amount,
        refund_amount: r.details.financial.refund_amount,
        supplier_cost_difference: r.details.financial.supplier_cost_difference,
        customer_amount_difference: r.details.financial.customer_amount_difference,
        status: itemStatus,
        reconciliation_status: itemState,
        reconciliation_details: r.details,
        recommendations: r.details.recommendations,
        notes: null,
        refund_status: r.refund_status || null,
      };
    });

    // 3. Post bulk array payload to PostgREST
    if (itemsPayload.length > 0) {
      const itemsRes = await supabaseRest('reconciliation_items', {
        method: 'POST',
        body: JSON.stringify(itemsPayload),
      });

      if (!itemsRes.ok) {
        const errText = await itemsRes.text();
        throw new Error(`Failed to bulk insert reconciliation items: ${errText}`);
      }
    }

    return reportId;
  }
}
