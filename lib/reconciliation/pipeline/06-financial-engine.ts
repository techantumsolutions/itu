import { VerificationResult } from './05-verification-engine';
import { ReconciliationReportSummary } from '../types';
import {
  convertWithRateMap,
  getFallbackExchangeRates,
} from '@/lib/routing/exchange-rates';

const REPORTING_CURRENCY = 'EUR';

function toReporting(amount: number, currency: string | null | undefined): number {
  if (!Number.isFinite(amount) || amount === 0) return 0
  const from = (currency ?? REPORTING_CURRENCY).trim().toUpperCase() || REPORTING_CURRENCY
  if (from === REPORTING_CURRENCY) return amount
  const { converted } = convertWithRateMap(
    Math.abs(amount),
    from,
    REPORTING_CURRENCY,
    new Map(),
    getFallbackExchangeRates(),
  )
  if (!Number.isFinite(converted)) return 0
  return amount < 0 ? -converted : converted
}

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
    
    const paidAmount = result.matchedTx
      ? parseFloat(String(result.matchedTx.amount ?? 0))
      : 0
    const paidCurrency = String(
      result.matchedTx?.currency
      ?? platform.paid_currency
      ?? platform.recorded_currency
      ?? supplier.billed_currency
      ?? 'EUR',
    ).toUpperCase()

    if (platform.paid_amount == null) platform.paid_amount = Number.isFinite(paidAmount) ? paidAmount : 0
    if (!platform.paid_currency) platform.paid_currency = paidCurrency

    // Platform order amount (what the customer paid)
    const clientCharged = Number.isFinite(paidAmount) && paidAmount > 0 ? paidAmount : platformCost;

    // Supplier Cost Difference: platform cost - supplier billed cost (negative = supplier overbilled)
    const supplierCostDifference = platformCost - supplierCost;

    // Customer Amount Difference: customer payment amount - platform expected cost
    // (raw numbers; may be mixed currency — report layer converts with FX)
    const customerAmountDifference = clientCharged - platformCost;

    // Difference Amount: customer payment amount - supplier billed cost
    const differenceAmount = clientCharged - supplierCost;

    // Refund required detection: failed recharge + captured payment + no completed refund yet
    // refund_amount is in paidCurrency (customer payment currency), NOT supplier billed currency.
    let refundAmount = 0;
    let refundCurrency = paidCurrency;
    if (
      platform.recharge_status === 'failed' &&
      platform.payment_status === 'completed' &&
      result.status !== 'REFUND_COMPLETED'
    ) {
      refundAmount = clientCharged;
      refundCurrency = paidCurrency;
    }

    details.financial = {
      difference_amount: Number(differenceAmount.toFixed(4)),
      refund_amount: Number(refundAmount.toFixed(4)),
      refund_currency: refundCurrency,
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

      // Normalize every money field to EUR before summing (avoids INR refund − EUR billed).
      const billedEur = toReporting(s.billed_amount, s.billed_currency);
      supplierBilled += billedEur;

      if (p) {
        const expectedEur = toReporting(p.recorded_cost, p.recorded_currency);
        platformExpected += expectedEur;
        costDifference += expectedEur - billedEur;
        const refundCur = f.refund_currency || p.paid_currency || s.billed_currency;
        totalRefunds += toReporting(f.refund_amount, refundCur);
      } else {
        // Missing platform transaction: billed but expected cost is 0
        costDifference -= billedEur;
      }
    }

    // Net Settlement = Supplier Billed − Refunds (same currency: EUR)
    const netSettlement = supplierBilled - totalRefunds;

    return {
      supplier_billed: Number(supplierBilled.toFixed(2)),
      platform_expected: Number(platformExpected.toFixed(2)),
      cost_difference: Number(costDifference.toFixed(2)),
      refunds: Number(totalRefunds.toFixed(2)),
      net_settlement: Number(netSettlement.toFixed(2)),
    };
  }
}
