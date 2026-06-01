import { dingConnector } from './ding-connector'
import type { ProviderConfig, RawPlanRecord } from './types'

describe('dingConnector', () => {
  const config: ProviderConfig = {
    id: 'prov-ding',
    code: 'DING',
    name: 'Ding Connect',
    adapterKey: 'ding',
    isActive: true,
    priority: 10,
    refreshIntervalMinutes: 60,
    supportedCountries: ['NG'],
  }

  it('normalizes a raw DingProduct record successfully', async () => {
    const rawRecord: RawPlanRecord = {
      providerPlanId: 'sku-ng-airtel-100',
      raw: {
        SkuCode: 'sku-ng-airtel-100',
        ProviderCode: 'AIRTEL_NG',
        LocalizationKey: 'Airtel Nigeria 100 NGN',
        DefaultDisplayText: 'Airtel NGN 100 Airtime',
        CountryIso: 'NG',
        CommissionRate: 4.5,
        Minimum: {
          SendValue: 10,
          SendCurrencyIso: 'EUR',
          ReceiveValue: 100,
          ReceiveCurrencyIso: 'NGN',
        },
        Maximum: {
          SendValue: 10,
          SendCurrencyIso: 'EUR',
          ReceiveValue: 100,
          ReceiveCurrencyIso: 'NGN',
        },
        Benefits: [
          {
            Type: 'Airtime',
            Value: 100,
            Unit: 'NGN',
          },
        ],
        ValidityPeriodIso: 'P30D',
      },
    }

    const normalized = await dingConnector.normalizePlans({
      config,
      raw: [rawRecord],
    })

    expect(normalized).toHaveLength(1)
    const plan = normalized[0]
    expect(plan.providerId).toBe('prov-ding')
    expect(plan.providerCode).toBe('DING')
    expect(plan.providerPlanId).toBe('sku-ng-airtel-100')
    expect(plan.countryIso3).toBe('NGA') // NG successfully normalized to NGA
    expect(plan.operatorRef).toBe('ding:AIRTEL_NG')
    expect(plan.operatorName).toBe('Airtel Nigeria')
    expect(plan.name).toBe('Airtel NGN 100 Airtime')
    expect(plan.service).toBe('Mobile')
    expect(plan.planType).toBe('AIRTIME')
    expect(plan.retailAmount).toBe(10)
    expect(plan.retailCurrency).toBe('EUR')
    expect(plan.wholesaleAmount).toBe(9.55) // 10 * (1 - 4.5/100) = 9.55
    expect(plan.wholesaleCurrency).toBe('EUR')
    expect(plan.validityDays).toBe(30)
    expect(plan.benefits).toHaveLength(1)
    expect(plan.benefits[0].type).toBe('AIRTIME')
  })
})
