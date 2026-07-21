import {
  computeRechargeProcessingFeeAmount,
  resolveRechargeProcessingFeesForAmount,
  type RechargeProcessingFeeConfig,
} from '@/lib/settings/recharge-processing-fees'

/** Mirrors server payable formula: face + platform + gateway + tax. */
function computePayable(planPrice: number, config: RechargeProcessingFeeConfig, amountEur: number) {
  const fees = resolveRechargeProcessingFeesForAmount(amountEur, config)
  const computed = computeRechargeProcessingFeeAmount(planPrice, fees)
  const payableAmount =
    Math.round((planPrice + computed.platformFee + computed.paymentGatewayFee + computed.tax) * 100) /
    100
  return { fees, computed, payableAmount }
}

describe('server checkout payable formula', () => {
  const config: RechargeProcessingFeeConfig = {
    ranges: [
      {
        id: 'default',
        minAmount: 0,
        maxAmount: null,
        taxPercent: 0,
        platformFeePercent: 2,
        paymentGatewayFeePercent: 1,
      },
    ],
  }

  it('derives payable from plan face + fee percents (not client totals)', () => {
    const planPrice = 100
    const { computed, payableAmount } = computePayable(planPrice, config, planPrice)
    expect(computed.platformFee).toBe(2)
    expect(computed.paymentGatewayFee).toBe(1)
    expect(computed.tax).toBe(0)
    expect(payableAmount).toBe(103)
  })

  it('does not accept an alternate client underpay total', () => {
    const planPrice = 349
    const { payableAmount } = computePayable(planPrice, config, planPrice)
    const clientUnderpay = 1
    expect(payableAmount).toBeGreaterThan(clientUnderpay)
    expect(payableAmount).toBe(Math.round((349 + 349 * 0.02 + 349 * 0.01) * 100) / 100)
  })
})
