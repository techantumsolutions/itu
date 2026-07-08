import { VerificationResult } from './05-verification-engine';
import { ReconciliationReportSummary } from '../types';

export class FinancialEngine {
  /**
   * Calculates financial variances and deltas for a single verification result.
   */
  calculateItemFinance(result: VerificationResult): void {
    const details = result.details;
    const supplier = details.supplier_snapshot;
    const platform = details.platform_snapshot;

    if (!platform) {
      // Missing match: Billed by supplier but no platform record
      details.financial = {
        difference_amount: -supplier.billed_amount,
        refund_amount: 0,
        supplier_cost_difference: -supplier.billed_amount,
        customer_amount_difference: 0
      };
      return;
    }

    const supplierCost = supplier.billed_amount;
    const platformCost = platform.recorded_cost;
    
    // Platform order amount (what the customer paid, retrieved from matchedTx)
    const clientCharged = result.matchedTx ? parseFloat(result.matchedTx.amount) : platformCost;

    // Supplier Cost Difference: platform cost - supplier billed cost (negative = supplier overbilled)
    const supplierCostDifference = platformCost - supplierCost;

    // Customer Amount Difference: customer payment amount - platform expected cost
    const customerAmountDifference = clientCharged - platformCost;

    // Difference Amount: customer payment amount - supplier billed cost
    const differenceAmount = clientCharged - supplierCost;

    // Refund required detection: failed recharge + captured payment + no completed refund yet
    let refundAmount = 0;
    if (
      platform.recharge_status === 'failed' &&
      platform.payment_status === 'completed' &&
      result.status !== 'REFUND_COMPLETED'
    ) {
      refundAmount = clientCharged;
    }

    details.financial = {
      difference_amount: Number(differenceAmount.toFixed(4)),
      refund_amount: Number(refundAmount.toFixed(4)),
      supplier_cost_difference: Number(supplierCostDifference.toFixed(4)),
      customer_amount_difference: Number(customerAmountDifference.toFixed(4)),
    };
  }

  /**
   * Compiles the cumulative report-level summary totals from all line items.
   */
  compileSummary(results: VerificationResult[]): ReconciliationReportSummary {
    let supplierBilled = 0;
    let platformExpected = 0;
    let costDifference = 0;
    let totalRefunds = 0;

    for (const r of results) {
      const f = r.details.financial;
      const s = r.details.supplier_snapshot;
      const p = r.details.platform_snapshot;

      supplierBilled += s.billed_amount;
      
      if (p) {
        platformExpected += p.recorded_cost;
        costDifference += f.supplier_cost_difference;
        totalRefunds += f.refund_amount;
      } else {
        // Missing platform transaction: billed but expected cost is 0
        costDifference -= s.billed_amount;
      }
    }

    // Net Settlement = Billed Amount - Refunds (if billing correction handles deductions, or net payable)
    // Here: Net Settlement = Expected Platform cost + cost delta (or supplier billed amount - refunds due)
    const netSettlement = supplierBilled - totalRefunds;

    return {
      supplier_billed: Number(supplierBilled.toFixed(2)),
      platform_expected: Number(platformExpected.toFixed(2)),
      cost_difference: Number(costDifference.toFixed(2)),
      refunds: Number(totalRefunds.toFixed(2)),
      net_settlement: Number(netSettlement.toFixed(2))
    };
  }
}
