import { VerificationResult } from './05-verification-engine';

export class RecommendationEngine {
  /**
   * Generates read-only recommended actions for unclear items based on the type of mismatch.
   */
  generateRecommendation(result: VerificationResult): void {
    const details = result.details;
    const comparison = details.comparison;
    const platform = details.platform_snapshot;
    const financial = details.financial;

    // 1. Missing Match
    if (!platform) {
      details.recommendations = [
        { action: 'ignore', reason: 'Unrecognized transaction: Billed by supplier but does not exist in platform database.' }
      ];
      return;
    }

    const recs = [];

    // 2. Refund Required (recharge failed but payment completed and not refunded)
    if (financial.refund_amount > 0) {
      recs.push({
        action: 'refund',
        reason: `Recharge failed (${platform.recharge_status}) but payment was successfully captured. Recommending customer wallet/gateway refund.`
      });
      result.refund_status = 'required';
    }

    // 3. Amount Mismatch (supplier billed cost differs from platform cost)
    if (!comparison.amount_match) {
      const delta = financial.supplier_cost_difference;
      const desc = delta < 0 
        ? `Supplier overbilled platform by $${Math.abs(delta).toFixed(2)}.` 
        : `Supplier underbilled platform by $${Math.abs(delta).toFixed(2)}.`;
        
      recs.push({
        action: 'resolve',
        reason: `Cost discrepancy detected. ${desc} Recommend contacting supplier for credit note adjust.`
      });
    }

    // 4. Provider Mismatch
    if (!comparison.provider_match) {
      recs.push({
        action: 'resolve',
        reason: `Provider mismatch. Platform LCR records indicate routing processed via another provider. Verify billing invoice details.`
      });
    }

    // 5. Status Mismatch (excluding refund required cases)
    if (!comparison.status_match && financial.refund_amount === 0) {
      recs.push({
        action: 'resolve',
        reason: `Status mismatch. Platform status is "${platform.recharge_status}" while supplier reports "${details.supplier_snapshot.billed_status}".`
      });
    }

    // 6. Clear Verification
    if (recs.length === 0) {
      recs.push({
        action: 'none',
        reason: 'Verification successful. Billed details match expected historical logs.'
      });
    }

    details.recommendations = recs;
  }
}
