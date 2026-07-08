import { VerificationResult } from './05-verification-engine';
import { ReconciliationState } from '../types';

export class ClassificationEngine {
  /**
   * Evaluates comparison parameters and flags, classifying the transaction state.
   */
  classifyItem(result: VerificationResult): ReconciliationState {
    const details = result.details;
    const comparison = details.comparison;
    const platform = details.platform_snapshot;

    // 1. Missing Match -> UNCLEAR
    if (!platform) {
      return 'UNCLEAR';
    }

    // 2. Latency/In-Progress States -> PENDING
    const isProcessing =
      platform.recharge_status === 'processing' ||
      platform.recharge_status === 'pending' ||
      platform.payment_status === 'pending' ||
      result.status === 'REFUND_PENDING';

    if (isProcessing) {
      return 'PENDING';
    }

    // 3. Failures or Mismatches -> UNCLEAR
    const hasDiscrepancy =
      !comparison.status_match ||
      !comparison.amount_match ||
      !comparison.provider_match ||
      !comparison.currency_match ||
      result.status === 'DUPLICATE_SUPPLIER_ROW' ||
      result.status === 'REFUND_REQUIRED' ||
      result.status === 'PROVIDER_MISMATCH' ||
      result.status === 'AMOUNT_MISMATCH' ||
      result.status === 'CURRENCY_MISMATCH' ||
      result.status === 'STATUS_MISMATCH';

    if (hasDiscrepancy) {
      return 'UNCLEAR';
    }

    // 4. Successful Verification -> CLEAR
    return 'CLEAR';
  }
}
