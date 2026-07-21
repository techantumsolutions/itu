import { razorpayCurrencyExponent } from '@/lib/payments/razorpay-amount'

/** Mirrors server max-reward point selection used by wallet checkout. */
function computeMaxRewardPointsPure(input: {
  pointsBalance: number
  minBalanceToRedeem: number
  maxRedemptionPct: number
  pointValueInPay: number
  payableInPay: number
}): number {
  if (input.pointsBalance <= 0) return 0
  if (input.pointsBalance < input.minBalanceToRedeem) return 0
  const maxByPct = Math.floor(input.pointsBalance * (input.maxRedemptionPct / 100))
  if (maxByPct <= 0 || input.pointValueInPay <= 0) return 0
  const maxByPayable = Math.floor(input.payableInPay / input.pointValueInPay)
  return Math.max(0, Math.min(maxByPct, maxByPayable, input.pointsBalance))
}

describe('wallet checkout server reward selection', () => {
  it('ignores client point quantities and caps by balance pct and payable', () => {
    const points = computeMaxRewardPointsPure({
      pointsBalance: 1000,
      minBalanceToRedeem: 0,
      maxRedemptionPct: 50,
      pointValueInPay: 0.1,
      payableInPay: 40,
    })
    // maxByPct=500, maxByPayable=400 → 400
    expect(points).toBe(400)
  })

  it('returns 0 when below min balance', () => {
    expect(
      computeMaxRewardPointsPure({
        pointsBalance: 10,
        minBalanceToRedeem: 100,
        maxRedemptionPct: 50,
        pointValueInPay: 0.01,
        payableInPay: 100,
      }),
    ).toBe(0)
  })

  it('payable rounding uses currency exponent helper', () => {
    expect(razorpayCurrencyExponent('INR')).toBe(2)
    expect(Math.round(103.456 * 100) / 100).toBe(103.46)
  })
})
