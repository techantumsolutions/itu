import { NormalizedSupplierRow, ReconciliationDetails, ReconciliationItemStatus } from '../types';
import { PlatformLookups } from './04-matching-engine';
import { RECONCILIATION_CONFIG } from '../config';

export interface VerificationResult {
  matchedTx: any | null;
  confidenceScore: number;
  matchedBy: string | null;
  status: ReconciliationItemStatus;
  details: ReconciliationDetails;
  refund_status?: 'required' | 'pending' | 'completed' | null;
}

export class VerificationEngine {
  /**
   * Executes multi-priority matching and verifies the complete transaction lifecycle timeline.
   */
  verifyRow(
    row: NormalizedSupplierRow,
    lookups: PlatformLookups
  ): VerificationResult {
    let matchedTx: any = null;
    let matchedBy: string | null = null;
    let confidenceScore = 0;

    const normPhone = row.mobile.replace(/\D/g, '');
    const amountStr = row.supplierCost.toFixed(2);

    const provTxRef = row.providerReference || row.supplierTransactionId;

    // Direct Transaction ID (UUID) Match
    if (row.supplierTransactionId && lookups.transactionMap.has(row.supplierTransactionId)) {
      matchedTx = lookups.transactionMap.get(row.supplierTransactionId);
      matchedBy = 'Transaction UUID';
      confidenceScore = 100;
    }
    // Priority 1: Provider Transaction ID
    else if (provTxRef && lookups.providerTxIdMap.has(provTxRef)) {
      matchedTx = lookups.providerTxIdMap.get(provTxRef);
      matchedBy = 'Provider Transaction ID';
      confidenceScore = RECONCILIATION_CONFIG.confidenceScores.PROVIDER_TX_ID;
    }
    // Priority 2: Provider Reference (attempts)
    else if (provTxRef && lookups.providerRefMap.has(provTxRef)) {
      matchedTx = lookups.providerRefMap.get(provTxRef);
      matchedBy = 'Provider Reference';
      confidenceScore = RECONCILIATION_CONFIG.confidenceScores.PROVIDER_REF;
    }
    // Priority 3: External Reference
    else if (row.externalReference && lookups.distributorRefMap.has(row.externalReference)) {
      matchedTx = lookups.distributorRefMap.get(row.externalReference);
      matchedBy = 'External Reference';
      confidenceScore = RECONCILIATION_CONFIG.confidenceScores.PROVIDER_REF; // matched by external ref
    }
    // Priority 4: Recharge Order ID
    else if (row.externalReference && lookups.rechargeOrderIdMap.has(row.externalReference)) {
      matchedTx = lookups.rechargeOrderIdMap.get(row.externalReference);
      matchedBy = 'Recharge Order ID';
      confidenceScore = RECONCILIATION_CONFIG.confidenceScores.RECHARGE_ORDER_ID;
    }
    // Priority 5: Payment Reference
    else if (row.providerReference && lookups.paymentRefMap.has(row.providerReference)) {
      const payEvent = lookups.paymentRefMap.get(row.providerReference);
      if (payEvent && payEvent.transaction_id) {
        matchedTx = lookups.transactionMap.get(payEvent.transaction_id);
        matchedBy = 'Payment Reference';
        confidenceScore = RECONCILIATION_CONFIG.confidenceScores.PAYMENT_REF;
      }
    }
    // Priority 6: Mobile + Amount + Country
    else {
      const countryKey = `${normPhone}_${amountStr}_${row.country.toUpperCase()}`;
      if (lookups.phoneAmountCountryMap.has(countryKey)) {
        matchedTx = lookups.phoneAmountCountryMap.get(countryKey);
        matchedBy = 'Mobile + Amount + Country';
        confidenceScore = RECONCILIATION_CONFIG.confidenceScores.MOBILE_AMOUNT_COUNTRY;
      }
      // Priority 7: Mobile + Amount + Date (YYYY-MM-DD)
      else {
        const dateKey = `${normPhone}_${amountStr}_${row.transactionDate.slice(0, 10)}`;
        if (lookups.phoneAmountDateMap.has(dateKey)) {
          matchedTx = lookups.phoneAmountDateMap.get(dateKey);
          matchedBy = 'Mobile + Amount + Date';
          confidenceScore = RECONCILIATION_CONFIG.confidenceScores.MOBILE_AMOUNT_DATE;
        }
        // Priority 8: Mobile + Amount + Time Window
        else {
          const winKey = `${normPhone}_${amountStr}`;
          const candidates = lookups.phoneAmountWindowMap.get(winKey) || [];
          let bestCandidate: any = null;
          let minDiff = Infinity;
          const limitMs = RECONCILIATION_CONFIG.globalTolerances.timeWindowMinutes * 60 * 1000;
          const rowTime = new Date(row.transactionDate).getTime();

          for (const cand of candidates) {
            const candTime = new Date(cand.created_at).getTime();
            const diff = Math.abs(rowTime - candTime);
            if (diff <= limitMs && diff < minDiff) {
              minDiff = diff;
              bestCandidate = cand;
            }
          }

          if (bestCandidate) {
            matchedTx = bestCandidate;
            matchedBy = 'Mobile + Amount + Time Window';
            confidenceScore = RECONCILIATION_CONFIG.confidenceScores.MOBILE_AMOUNT_WINDOW;
          }
        }
      }
    }

    // 2. BUILD SNAPSHOTS AND TIMELINE

    const supplierSnapshot = {
      supplier_tx_id: row.supplierTransactionId,
      supplier_ref: row.providerReference,
      mobile: normPhone,
      billed_amount: row.supplierCost,
      billed_currency: row.currency,
      billed_status: row.status,
      timestamp: row.transactionDate,
    };

    const timeline = [
      { timestamp: row.transactionDate, event: 'Supplier Billing Logged' }
    ];

    const comparison = {
      status_match: false,
      amount_match: false,
      provider_match: false,
      currency_match: false,
    };

    // If missing match, return early with MISSING_PLATFORM
    if (!matchedTx) {
      return {
        matchedTx: null,
        confidenceScore: 0,
        matchedBy: null,
        status: 'MISSING_PLATFORM',
        details: {
          supplier_snapshot: supplierSnapshot,
          comparison,
          timeline,
          financial: {
            difference_amount: -row.supplierCost,
            refund_amount: 0,
            supplier_cost_difference: -row.supplierCost,
            customer_amount_difference: 0
          },
          recommendations: [
            { action: 'ignore', reason: 'Billing row exists on supplier but not found in platform records.' }
          ],
          metadata: {
            confidence_score: 0,
            matched_by: null
          }
        }
      };
    }

    // Process matched transaction records
    const ro = matchedTx.recharge_orders?.[0] ?? null;
    const metaProviderCost = ro?.metadata && typeof ro.metadata === 'object' ? (ro.metadata as any).provider_cost : null;
    const metaProviderCostCurrency = ro?.metadata && typeof ro.metadata === 'object' ? (ro.metadata as any).provider_cost_currency : null;

    const recordedCost = ro ? parseFloat(ro.receive_amount ?? metaProviderCost ?? ro.send_amount ?? matchedTx.amount) : parseFloat(matchedTx.amount);
    const recordedCurrency = ro ? (ro.receive_currency || metaProviderCostCurrency || ro.send_currency || matchedTx.currency) : matchedTx.currency;
    const roStatus = ro ? ro.status : matchedTx.status;
    const txCreated = matchedTx.created_at;

    timeline.push({ timestamp: txCreated, event: 'Platform Transaction Created' });

    // Lookup payment status, checking recharge_orders.payment_status first as source of truth
    const payEvents = lookups.paymentEventMap.get(matchedTx.id) || [];
    const completedPay = payEvents.find(p => p.status === 'completed' || p.status === 'captured');
    let paymentStatus = ro?.payment_status || (completedPay ? 'completed' : (payEvents[0]?.status || 'pending'));
    const metadata = matchedTx.metadata && typeof matchedTx.metadata === 'object' ? matchedTx.metadata : null;
    const isWalletPayment = metadata && (metadata.used_wallet_balance || (metadata as any).wallet_currency);
    if (isWalletPayment) {
      paymentStatus = 'completed';
    }
    if (completedPay) {
      timeline.push({ timestamp: completedPay.created_at || txCreated, event: `Payment Captured via ${completedPay.provider}` });
    }

    // Lookup refund status
    const refundEvents = lookups.refundMap.get(matchedTx.id) || [];
    const completedRefund = refundEvents.find(r => r.status === 'completed');
    const refundStatus = completedRefund ? 'completed' : (refundEvents[0]?.status ? 'pending' : null);
    if (completedRefund) {
      timeline.push({ timestamp: completedRefund.created_at || txCreated, event: 'Refund Processed' });
    }

    // Lookup LCR failovers
    let finalProvider = ro?.provider || 'Unknown';
    let failoverOccurred = false;
    const distRefCandidates = [
      ro?.id,
      matchedTx.id,
      matchedTx.metadata?.distributor_ref,
      matchedTx.external_ref
    ].filter(Boolean) as string[];
    
    let attempt = null;
    for (const ref of distRefCandidates) {
      attempt = lookups.attemptMap.get(ref);
      if (attempt) break;
    }
    
    if (attempt) {
      finalProvider = attempt.provider_adapter || finalProvider;
      const attemptsList = Array.isArray(attempt.attempts) ? attempt.attempts : [];
      if (attemptsList.length > 1) {
        failoverOccurred = true;
        attemptsList.forEach((att: any, idx: number) => {
          timeline.push({
            timestamp: att.timestamp || txCreated,
            event: `LCR Failover Attempt #${idx + 1}: Provider ${att.provider} - Status ${att.status}`
          });
        });
      }
    }

    timeline.push({ timestamp: ro?.updated_at || txCreated, event: `Recharge Order Final Status: ${roStatus}` });

    const platformSnapshot = {
      transaction_id: matchedTx.id,
      order_id: ro?.id || '',
      payment_status: paymentStatus,
      recharge_status: roStatus,
      recorded_cost: isNaN(recordedCost) ? 0 : recordedCost,
      recorded_currency: recordedCurrency || 'USD',
      timestamp: txCreated,
    };

    // Helper function to resolve canonical provider names
    const canonicalizeProvider = (providerStr: string, providerNameMap?: Map<string, string>): string => {
      if (!providerStr) return 'unknown';
      const clean = providerStr.trim().toLowerCase();
      if (providerNameMap && providerNameMap.has(clean)) {
        return providerNameMap.get(clean)!;
      }
      if (providerNameMap && providerNameMap.has(providerStr.trim())) {
        return providerNameMap.get(providerStr.trim())!;
      }
      const lower = clean.replace(/[^a-z0-9]/g, '');
      if (lower === 'dtone' || lower === 'a7b07821e1094a56987a30afaf2f8654') {
        return 'dtone';
      }
      if (lower === 'valuetopup' || lower === 'b501b1ab800e46f385a9c421c5faaa0f') {
        return 'valuetopup';
      }
      if (lower === 'ding' || lower === 'dingconnect' || lower === 'bb376d0e2cd6495889564a9881948f86') {
        return 'ding';
      }
      return lower;
    };

    // 3. COMPARISON LOGIC
    
    comparison.status_match = (row.status === 'completed' && roStatus === 'completed') || 
                              (row.status === 'failed' && roStatus === 'failed');

    const absCostDelta = Math.abs(row.supplierCost - recordedCost);
    comparison.amount_match = absCostDelta <= RECONCILIATION_CONFIG.globalTolerances.amountDeltaLimit;

    comparison.currency_match = row.currency.toUpperCase() === (recordedCurrency || '').toUpperCase();

    // Verify provider match, accommodating failovers and canonical names
    const billedProvider = canonicalizeProvider(row.supplier, lookups.providerNameMap);
    const resolvedProvider = canonicalizeProvider(finalProvider, lookups.providerNameMap);
    comparison.provider_match = resolvedProvider === billedProvider;

    let itemStatus: ReconciliationItemStatus = 'MATCHED';
    if (!comparison.provider_match) itemStatus = 'PROVIDER_MISMATCH';
    else if (!comparison.currency_match) itemStatus = 'CURRENCY_MISMATCH';
    else if (!comparison.amount_match) itemStatus = 'AMOUNT_MISMATCH';
    else if (!comparison.status_match) itemStatus = 'STATUS_MISMATCH';

    // Timeline sorting chronologically
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return {
      matchedTx,
      confidenceScore,
      matchedBy,
      status: itemStatus,
      details: {
        supplier_snapshot: supplierSnapshot,
        platform_snapshot: platformSnapshot,
        comparison,
        timeline,
        financial: {
          difference_amount: 0, // calculated in next stage
          refund_amount: 0,
          supplier_cost_difference: 0,
          customer_amount_difference: 0,
        },
        recommendations: [],
        metadata: {
          confidence_score: confidenceScore,
          matched_by: matchedBy,
        }
      }
    };
  }
}
