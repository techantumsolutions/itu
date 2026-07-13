import {
  computeRechargeProcessingFeeAmount,
  computeRechargeServiceFeeAmount,
  parseRechargeProcessingFeeConfig,
  parseRechargeProcessingFees,
  resolveRechargeProcessingFeesForAmount,
  resolveRechargeProcessingFeesForLocalAmount,
  totalRechargeProcessingFeePercent,
  validateRechargeProcessingFeeRanges,
} from '@/lib/settings/recharge-processing-fees'

describe('recharge-processing-fees', () => {
  it('parses stored JSON shape (legacy flat)', () => {
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

  it('parses range-based config', () => {
    const config = parseRechargeProcessingFeeConfig({
      fee_type: 'percent_ranges',
      ranges: [
        {
          id: 'a',
          min_amount: 0,
          max_amount: 100,
          tax_percent: 0,
          platform_fee_percent: 2,
          payment_gateway_fee_percent: 1,
        },
        {
          id: 'b',
          min_amount: 100.01,
          max_amount: null,
          tax_percent: 1,
          platform_fee_percent: 1.5,
          payment_gateway_fee_percent: 0.5,
        },
      ],
    })
    expect(config.ranges).toHaveLength(2)
    expect(resolveRechargeProcessingFeesForAmount(50, config).platformFeePercent).toBe(2)
    expect(resolveRechargeProcessingFeesForAmount(200, config).taxPercent).toBe(1)
    expect(resolveRechargeProcessingFeesForAmount(200, config).rangeId).toBe('b')
  })

  it('returns default fees for null input via flat parse', () => {
    const fees = parseRechargeProcessingFees(null)
    expect(fees.taxPercent).toBe(0)
    expect(fees.platformFeePercent).toBe(2)
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

  it('rejects overlapping ranges', () => {
    const result = validateRechargeProcessingFeeRanges({
      ranges: [
        { id: '1', minAmount: 0, maxAmount: 100, taxPercent: 0, platformFeePercent: 2, paymentGatewayFeePercent: 0 },
        { id: '2', minAmount: 50, maxAmount: 200, taxPercent: 0, platformFeePercent: 1, paymentGatewayFeePercent: 0 },
      ],
    })
    expect(result.ok).toBe(false)
  })

  it('resolves local currency amounts against EUR ranges', () => {
    const config = parseRechargeProcessingFeeConfig({
      ranges: [
        {
          id: 'low',
          min_amount: 0,
          max_amount: 10,
          tax_percent: 0,
          platform_fee_percent: 2,
          payment_gateway_fee_percent: 0,
        },
        {
          id: 'high',
          min_amount: 10.01,
          max_amount: 100,
          tax_percent: 1,
          platform_fee_percent: 1,
          payment_gateway_fee_percent: 0.5,
        },
      ],
    })
    // 900 INR at 90 INR/EUR = 10 EUR → low band
    const low = resolveRechargeProcessingFeesForLocalAmount(900, 'INR', config, { INR: 90, EUR: 1 })
    expect(low.rangeId).toBe('low')
    expect(low.amountEur).toBeCloseTo(10, 5)
    // 1800 INR = 20 EUR → high band
    const high = resolveRechargeProcessingFeesForLocalAmount(1800, 'INR', config, { INR: 90, EUR: 1 })
    expect(high.rangeId).toBe('high')
  })
})
