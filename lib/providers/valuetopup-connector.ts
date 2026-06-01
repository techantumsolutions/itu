import { fetchValuetopupCatalog, type ValuetopupCatalogProduct } from '@/lib/valuetopup'
import type {
  FetchRawPlansOptions,
  NormalizedBenefit,
  NormalizedPlan,
  ProviderConfig,
  ProviderConnector,
  RawPlanRecord,
} from '@/lib/providers/types'

const DEFAULT_COUNTRY_ISO3 = 'MYS'

function text(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

function parseDenominations(denomination: string | null | undefined): number[] {
  if (!denomination?.trim()) return []
  return denomination
    .split(/[,;|]/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

function inferCountryIso3(product: ValuetopupCatalogProduct, filter?: string[]): string {
  const currency = text(product.denomination_currency || product.pricing?.currency).toUpperCase()
  const byCurrency: Record<string, string> = {
    MYR: 'MYS',
    BDT: 'BGD',
    IDR: 'IDN',
    PHP: 'PHL',
    THB: 'THA',
    VND: 'VNM',
    SGD: 'SGP',
    INR: 'IND',
    USD: 'USA',
  }
  const inferred = byCurrency[currency] || DEFAULT_COUNTRY_ISO3
  if (filter?.length && !filter.includes(inferred)) return ''
  return inferred
}

function productToPlans(config: ProviderConfig, product: ValuetopupCatalogProduct, countryIso3: string): NormalizedPlan[] {
  if (product.is_active === false) return []
  const code = text(product.code)
  const name = text(product.name) || code
  if (!code || !countryIso3) return []

  const currency = text(product.denomination_currency || product.pricing?.currency) || 'MYR'
  const unitPrice = num(product.denomination_unit_price) ?? 1
  const denominations = parseDenominations(product.denomination)
  const amounts = denominations.length ? denominations : [0]

  return amounts.map((faceValue) => {
    const providerPlanId = faceValue > 0 ? `${code}:${faceValue}` : code
    const retailAmount = faceValue > 0 ? faceValue * unitPrice : undefined
    const wholesaleRaw = product.pricing?.unit_price
    const wholesaleMultiplier = wholesaleRaw != null ? Number(wholesaleRaw) : NaN
    const wholesaleAmount =
      faceValue > 0 && Number.isFinite(wholesaleMultiplier)
        ? wholesaleMultiplier < 0
          ? faceValue + wholesaleMultiplier
          : faceValue * wholesaleMultiplier
        : undefined

    const benefit: NormalizedBenefit = {
      type: 'AIRTIME',
      amountBase: faceValue > 0 ? faceValue : undefined,
      totalIncludingTax: retailAmount,
      unit: currency,
    }

    return {
      providerId: config.id,
      providerCode: config.code,
      providerPlanId,
      countryIso3,
      operatorRef: `vt:${code}`,
      operatorName: name,
      service: 'Mobile',
      subservice: product.processing_time === 'instant' ? 'Instant' : undefined,
      planType: faceValue > 0 ? 'FIXED' : 'DYNAMIC',
      tags: ['VALUETOPUP', code],
      name: faceValue > 0 ? `${name} ${faceValue} ${currency}` : name,
      description: text(product.note) || undefined,
      retailAmount,
      retailCurrency: currency,
      wholesaleAmount,
      wholesaleCurrency: currency,
      benefits: [benefit],
      requiredFields: [['account']],
      raw: { product, faceValue, countryIso3 },
    } satisfies NormalizedPlan
  })
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

    const products = catalog.products ?? {}
    const countryFilter = (options?.countries ?? config.supportedCountries ?? [])
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)

    const records: RawPlanRecord[] = []
    for (const product of Object.values(products)) {
      const countryIso3 = inferCountryIso3(product, countryFilter.length ? countryFilter : undefined)
      if (!countryIso3) continue
      const plans = productToPlans(config, product, countryIso3)
      for (const plan of plans) {
        records.push({ providerPlanId: plan.providerPlanId, raw: plan.raw })
      }
    }
    return records
  },

  async normalizePlans({ config, raw }): Promise<NormalizedPlan[]> {
    const out: NormalizedPlan[] = []
    for (const r of raw) {
      const payload = r.raw as { product?: ValuetopupCatalogProduct; faceValue?: number; countryIso3?: string }
      const product = payload?.product
      const countryIso3 = text(payload?.countryIso3) || DEFAULT_COUNTRY_ISO3
      if (!product) continue
      out.push(...productToPlans(config, product, countryIso3))
    }
    const seen = new Set<string>()
    return out.filter((p) => {
      const key = p.providerPlanId
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
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
