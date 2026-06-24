import {
  computeRechargeProcessingFeeAmount,
  computeRechargeServiceFeeAmount,
  parseRechargeProcessingFees,
  totalRechargeProcessingFeePercent,
} from '@/lib/settings/recharge-processing-fees'

describe('recharge-processing-fees', () => {
  it('parses stored JSON shape', () => {
    const fees = parseRechargeProcessingFees({
      fee_type: 'percent',
      tax_percent: 1.5,
      platform_fee_percent: 2,
      payment_gateway_fee_percent: 0.5,
    })
    expect(fees.taxPercent).toBe(1.5)
    expect(fees.platformFeePercent).toBe(2)
    expect(fees.paymentGatewayFeePercent).toBe(0.5)
    expect(totalRechargeProcessingFeePercent(fees)).toBe(4)
  })

  it('returns zero fees for null input', () => {
    const fees = parseRechargeProcessingFees(null)
    expect(fees.taxPercent).toBe(0)
    expect(fees.platformFeePercent).toBe(0)
    expect(fees.paymentGatewayFeePercent).toBe(0)
  })

  it('computes fee amounts from subtotal and percentages', () => {
    const fees = parseRechargeProcessingFees({
      tax_percent: 10,
      platform_fee_percent: 2,
      payment_gateway_fee_percent: 1,
    })
    const amounts = computeRechargeProcessingFeeAmount(200, fees)
    expect(amounts.tax).toBe(20)
    expect(amounts.platformFee).toBe(4)
    expect(amounts.paymentGatewayFee).toBe(2)
    expect(amounts.total).toBe(26)
  })

  it('computes service fee as platform plus payment gateway', () => {
    const fees = parseRechargeProcessingFees({
      tax_percent: 18,
      platform_fee_percent: 2,
      payment_gateway_fee_percent: 1,
    })
    expect(computeRechargeServiceFeeAmount(200, fees)).toBe(6)
  })

  it('clamps each percentage to 100', () => {
    const fees = parseRechargeProcessingFees({
      tax_percent: 150,
      platform_fee_percent: 50,
      payment_gateway_fee_percent: 60,
    })
    expect(fees.taxPercent).toBe(100)
    expect(fees.platformFeePercent).toBe(50)
    expect(fees.paymentGatewayFeePercent).toBe(60)
    expect(totalRechargeProcessingFeePercent(fees)).toBe(100)
  })
})
