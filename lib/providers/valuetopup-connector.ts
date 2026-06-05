import { fetchValuetopupCatalog } from '@/lib/valuetopup'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'
import type {
  FetchRawPlansOptions,
  NormalizedBenefit,
  NormalizedPlan,
  ProviderConfig,
  ProviderConnector,
  RawPlanRecord,
} from '@/lib/providers/types'

function text(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

export const valuetopupConnector: ProviderConnector = {
  adapterKey: 'valuetopup',

  async fetchRawPlans(config: ProviderConfig, options?: FetchRawPlansOptions): Promise<RawPlanRecord[]> {
    const a = config.auth
    const catalog = await fetchValuetopupCatalog(
      {
        apiKey: a?.apiKey,
        apiSecret: a?.apiSecret,
        baseUrl: config.baseUrl,
      },
      { includeInactive: false },
    )

    const skus = Array.isArray(catalog?.payLoad) ? catalog.payLoad : []
    const countryFilter = (options?.countries ?? config.supportedCountries ?? [])
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)

    const records: RawPlanRecord[] = []
    for (const sku of skus) {
      const countryCode2 = text(sku.countryCode).toUpperCase()
      const countryIso3 = normalizeCountryIso3(countryCode2)
      if (countryFilter.length && !countryFilter.includes(countryIso3)) continue

      records.push({ providerPlanId: text(sku.skuId), raw: sku })
    }
    return records
  },

  async normalizePlans({ config, raw }): Promise<NormalizedPlan[]> {
    return raw
      .map((r) => {
        const sku: any = r.raw ?? {}
        const skuId = text(sku.skuId)
        if (!skuId) return null

        const countryCode2 = text(sku.countryCode).toUpperCase()
        const countryIso3 = normalizeCountryIso3(countryCode2)
        const operatorId = text(sku.operatorId)
        const operatorName = text(sku.operatorName)
        if (!countryIso3 || !operatorId) return null

        // Prices:
        const retailAmount = num(sku.min?.faceValue) || 0
        const discountPercent = num(sku.discount) || 0
        const wholesaleAmount = Math.round(retailAmount * (1 - discountPercent / 100) * 100) / 100
        const currency = text(sku.min?.faceValueCurrency) || 'USD'

        const benefit: NormalizedBenefit = {
          type: sku.category === 'Pin' ? 'AIRTIME' : sku.category === 'eSIM' || sku.category === 'Rtr' ? 'COMBO' : 'OTHER',
          amountBase: retailAmount || undefined,
          unit: currency,
        }

        return {
          providerId: config.id,
          providerCode: config.code,
          providerPlanId: skuId,
          countryIso3,
          operatorRef: `vt:${operatorId}`,
          operatorName: operatorName || undefined,
          service: sku.category === 'Pin' ? 'Mobile' : sku.category === 'eSIM' ? 'eSIM' : 'Mobile',
          planType: sku.category === 'Pin' ? 'PIN' : 'AIRTIME',
          tags: ['VALUETOPUP', text(sku.category).toUpperCase()],
          name: text(sku.skuName) || text(sku.productName),
          description: text(sku.additionalInformation) || undefined,
          retailAmount,
          retailCurrency: currency,
          wholesaleAmount,
          wholesaleCurrency: currency,
          benefits: [benefit],
          requiredFields: sku.category === 'Pin' ? [] : [['account']],
          category: text(sku.category) || undefined,
          subcategory: text(sku.category) || undefined,
          raw: sku,
        } satisfies NormalizedPlan
      })
      .filter(Boolean) as NormalizedPlan[]
  },

  async healthCheck(config) {
    const started = Date.now()
    try {
      await fetchValuetopupCatalog({
        apiKey: config.auth?.apiKey,
        apiSecret: config.auth?.apiSecret,
        baseUrl: config.baseUrl,
      })
      return { ok: true, latencyMs: Date.now() - started }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - started, message: e instanceof Error ? e.message : 'health_failed' }
    }
  },
}
