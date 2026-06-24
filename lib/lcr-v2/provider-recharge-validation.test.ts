import {
  resolveDingRechargeAmount,
  resolveValueTopupRechargeAmount,
  resolveDtoneRechargeAmount,
  isAmountWithinProviderRange,
} from '@/lib/lcr-v2/provider-recharge-amount'
import {
  evaluateProviderRechargeEligibility,
  buildDingPayload,
  buildValueTopupPayload,
  buildDtonePayload,
} from '@/lib/lcr-v2/provider-recharge-validation'
import { PROVIDER_RECHARGE_ERRORS } from '@/lib/lcr-v2/provider-recharge-errors'
import { normalizeProviderError } from '@/lib/lcr-v2/provider-recharge-errors'

describe('provider recharge amount resolution', () => {
  it('resolves Ding SendValue from Minimum.SendValue, not customer price', () => {
    const resolved = resolveDingRechargeAmount({
      id: 'raw-1',
      provider_id: 'p-ding',
      provider_plan_id: 'SKU-AIRTEL-IN',
      amount: 999,
      currency: 'INR',
      raw_json: {
        Minimum: {
          SendValue: 3.72,
          SendCurrencyIso: 'EUR',
          ReceiveValue: 1098,
          ReceiveCurrencyIso: 'INR',
        },
        Maximum: {
          SendValue: 3.72,
          SendCurrencyIso: 'EUR',
        },
      },
    })

    expect(resolved.providerAmount).toBe(3.72)
    expect(resolved.providerCurrency).toBe('EUR')
    expect(resolved.amountField).toBe('send_value')
    expect(resolved.receiveAmount).toBe(1098)
  })

  it('resolves ValueTopup face value from min.faceValue', () => {
    const resolved = resolveValueTopupRechargeAmount(
      {
        id: 'raw-2',
        provider_id: 'p-vt',
        provider_plan_id: '12345',
        raw_json: {
          skuId: '12345',
          min: { faceValue: 10.5, faceValueCurrency: 'EUR' },
          max: { faceValue: 47.68, faceValueCurrency: 'EUR' },
        },
      },
      '12345',
    )

    expect(resolved.providerAmount).toBe(10.5)
    expect(resolved.providerCurrency).toBe('EUR')
    expect(resolved.minAmount).toBe(10.5)
    expect(resolved.maxAmount).toBe(47.68)
  })

  it('resolves DT One with no send amount', () => {
    const resolved = resolveDtoneRechargeAmount({
      id: 'raw-3',
      provider_id: 'p-dtone',
      provider_plan_id: '98765',
      destination_amount: 500,
      destination_currency: 'INR',
      raw_json: {
        id: 98765,
        destination: { amount: 500, unit: 'INR' },
      },
    })

    expect(resolved.providerAmount).toBeNull()
    expect(resolved.amountField).toBe('none')
    expect(resolved.receiveAmount).toBe(500)
  })

  it('validates amount within min/max range', () => {
    expect(isAmountWithinProviderRange(10, 0.95, 47.68)).toBe(true)
    expect(isAmountWithinProviderRange(999, 0.95, 47.68)).toBe(false)
    expect(isAmountWithinProviderRange(0.5, 0.95, 47.68)).toBe(false)
  })
})

describe('provider recharge validation', () => {
  const dingRaw = {
    id: 'raw-ding',
    provider_id: 'p-ding',
    provider_plan_id: 'SKU-IN-AIRTEL',
    catalog_status: 'ACTIVE',
    raw_json: {
      Minimum: {
        SendValue: 3.72,
        SendCurrencyIso: 'EUR',
        ReceiveValue: 1098,
        ReceiveCurrencyIso: 'INR',
      },
      Maximum: {
        SendValue: 3.72,
        SendCurrencyIso: 'EUR',
      },
    },
  }

  it('marks Ding eligible with catalog SendValue payload', () => {
    const result = evaluateProviderRechargeEligibility({
      adapterKey: 'ding',
      providerId: 'p-ding',
      providerPlanId: 'SKU-IN-AIRTEL',
      internalPlanId: 'plan-internal-1',
      phoneDigits: '919876543210',
      requestedAmount: 999,
      externalId: 'TEST-REF',
      rawPlan: dingRaw,
    })

    expect(result.eligible).toBe(true)
    expect(result.providerAmount).toBe(3.72)
    expect(result.providerCurrency).toBe('EUR')
    expect(result.payload).toEqual(
      buildDingPayload({
        providerPlanId: 'SKU-IN-AIRTEL',
        phoneDigits: '919876543210',
        externalId: 'TEST-REF',
        sendValue: 3.72,
      }),
    )
  })

  it('rejects stale DT One mapping when product not in catalog', () => {
    const result = evaluateProviderRechargeEligibility({
      adapterKey: 'dtone',
      providerId: 'p-dtone',
      providerPlanId: '404040',
      internalPlanId: 'plan-internal-2',
      phoneDigits: '919876543210',
      skipPhoneCheck: true,
      rawPlan: null,
    })

    expect(result.eligible).toBe(false)
    expect(result.normalizedError).toBe(PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_NOT_FOUND)
  })

  it('rejects inactive provider product', () => {
    const result = evaluateProviderRechargeEligibility({
      adapterKey: 'ding',
      providerId: 'p-ding',
      providerPlanId: 'SKU-OLD',
      internalPlanId: 'plan-internal-3',
      phoneDigits: '919876543210',
      rawPlan: { ...dingRaw, catalog_status: 'INACTIVE' },
    })

    expect(result.eligible).toBe(false)
    expect(result.normalizedError).toBe(PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_INACTIVE)
  })

  it('builds ValueTopup payload with face value not INR customer price', () => {
    const payload = buildValueTopupPayload({
      providerPlanId: '555',
      phoneDigits: '919876543210',
      externalId: 'CORR-1',
      amount: 10.5,
    })
    expect(payload).toEqual({
      SkuId: 555,
      Amount: 10.5,
      Mobile: '919876543210',
      CorrelationId: 'CORR-1',
    })
  })

  it('builds DT One payload without amount field', () => {
    const payload = buildDtonePayload({
      providerPlanId: '98765',
      phoneDigits: '919876543210',
      externalId: 'EXT-1',
    })
    expect(payload).toEqual({
      external_id: 'EXT-1',
      product_id: 98765,
      auto_confirm: true,
      credit_party_identifier: { mobile_number: '+919876543210' },
    })
    expect(payload).not.toHaveProperty('amount')
  })
})

describe('normalizeProviderError', () => {
  it('maps Ding ParameterOutOfRange to PROVIDER_AMOUNT_OUT_OF_RANGE', () => {
    const err = normalizeProviderError({
      adapterKey: 'ding',
      providerCode: 'ParameterOutOfRange',
      providerMessage: 'SendValue',
    })
    expect(err.code).toBe(PROVIDER_RECHARGE_ERRORS.PROVIDER_AMOUNT_OUT_OF_RANGE)
  })

  it('maps DT One 1000404 to PROVIDER_PRODUCT_NOT_FOUND', () => {
    const err = normalizeProviderError({
      adapterKey: 'dtone',
      providerCode: '1000404',
      providerMessage: 'Not Found',
      httpStatus: 404,
    })
    expect(err.code).toBe(PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_NOT_FOUND)
  })
})
