import {
  providerPreValidation,
  resolveValueTopupCatalogAmount,
  valueTopupFaceValueFromRaw,
  isDingInsufficientBalance,
} from '@/lib/lcr-v2/provider-pre-validation'
import type { ProviderExecutionContext } from '@/lib/lcr-v2/provider-execution-context'

jest.mock('@/lib/api/ding-connect', () => ({
  isApiConfigured: jest.fn(() => false),
  getBalance: jest.fn(),
}))

jest.mock('@/lib/lcr-v2/provider-recharge-validation', () => ({
  loadProviderRawPlan: jest.fn(),
}))

import { loadProviderRawPlan } from '@/lib/lcr-v2/provider-recharge-validation'

const mockedLoadRaw = loadProviderRawPlan as jest.MockedFunction<typeof loadProviderRawPlan>

const vtRaw = {
  id: 'raw-1',
  provider_id: 'p-vt',
  provider_plan_id: '12345',
  catalog_status: 'ACTIVE',
  raw_json: {
    min: { faceValue: 10.5, faceValueCurrency: 'EUR' },
    max: { faceValue: 47.68, faceValueCurrency: 'EUR' },
  },
}

function baseContext(overrides: Partial<ProviderExecutionContext> = {}): ProviderExecutionContext {
  return {
    providerId: 'p-vt',
    providerPlanId: '12345',
    adapterKey: 'valuetopup',
    providerPayloadStrategy: 'FACE_VALUE',
    provider_wholesale_amount: 77.73,
    provider_wholesale_currency: 'INR',
    destination_face_value: 10.5,
    destination_currency: 'EUR',
    customer_payment_amount: 349,
    customer_payment_currency: 'INR',
    phoneDigits: '919876543210',
    externalId: 'TXN-TEST-1',
    ...overrides,
  }
}

describe('ValueTopup catalog amount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('resolves catalog amount from min.faceValue', () => {
    expect(
      resolveValueTopupCatalogAmount({
        providerPlanId: '12345',
        rawPlan: vtRaw,
      }),
    ).toBe(10.5)
    expect(valueTopupFaceValueFromRaw(vtRaw)).toBe(10.5)
  })

  it('uses skuId:amount suffix when encoded in providerPlanId', () => {
    expect(
      resolveValueTopupCatalogAmount({
        providerPlanId: '12345:12.5',
        rawPlan: vtRaw,
      }),
    ).toBe(12.5)
  })

  it('returns null when catalog face value is missing', () => {
    expect(
      resolveValueTopupCatalogAmount({
        providerPlanId: '12345',
        rawPlan: null,
      }),
    ).toBeNull()
  })

  it('validates FACE_VALUE strategy using destination face value, not customer payment', async () => {
    mockedLoadRaw.mockResolvedValue(vtRaw)
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    const result = await providerPreValidation({
      executionContext: baseContext(),
    })

    expect(result.eligible).toBe(true)
    expect(result.debug?.destination_face_value).toBe(10.5)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[LCR Validation]'),
      expect.stringContaining('destination_face_value=10.5'),
    )
    expect(logSpy.mock.calls.some((c) => String(c).includes('customer_payment_amount=349'))).toBe(true)
    expect(logSpy.mock.calls.some((c) => String(c).includes('amountSent=349'))).toBe(false)

    logSpy.mockRestore()
  })

  it('skips when catalog face value is outside denomination range', async () => {
    mockedLoadRaw.mockResolvedValue({
      ...vtRaw,
      raw_json: {
        min: { faceValue: 50, faceValueCurrency: 'EUR' },
        max: { faceValue: 47.68, faceValueCurrency: 'EUR' },
      },
    })

    const result = await providerPreValidation({
      executionContext: baseContext({ destination_face_value: 50 }),
    })

    expect(result.eligible).toBe(false)
    expect(result.logMessage).toBe('[LCR] Provider skipped: denomination outside allowed range')
  })

  it('skips DT One when product mapping is missing from catalog', async () => {
    mockedLoadRaw.mockResolvedValue(null)

    const result = await providerPreValidation({
      executionContext: baseContext({
        providerId: 'p-dtone',
        adapterKey: 'dtone',
        providerPlanId: '404040',
        providerPayloadStrategy: 'PLAN_ID',
      }),
    })

    expect(result.eligible).toBe(false)
    expect(result.logMessage).toBe('[LCR] Provider skipped: stale or missing product mapping')
  })

  it('detects Ding InsufficientBalance response', () => {
    expect(isDingInsufficientBalance('InsufficientBalance', '')).toBe(true)
  })
})
