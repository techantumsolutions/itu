import { getProducts, getCountries, getProviders } from '@/lib/api/ding-connect'
import type { DingProvider } from '@/lib/types'
import { normalizeCountryIso3, toPublicCountryCode } from '@/lib/lcr/countries'
import type {
  ProviderConnector,
  ProviderConfig,
  RawPlanRecord,
  NormalizedPlan,
  NormalizedBenefit,
  FetchRawPlansOptions,
} from '@/lib/providers/types'

function text(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function parseValidityDays(iso?: string): number | undefined {
  if (!iso) return undefined
  const match = iso.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?/)
  if (!match) return undefined
  const y = num(match[1]) || 0
  const m = num(match[2]) || 0
  const d = num(match[3]) || 0
  return y * 365 + m * 30 + d
}

function toBenefit(b: any): NormalizedBenefit {
  const typeRaw = text(b?.Type).toUpperCase()
  const type =
    typeRaw === 'DATA' || typeRaw === 'VOICE' || typeRaw === 'SMS' || typeRaw === 'BONUS' || typeRaw === 'COMBO' || typeRaw === 'AIRTIME'
      ? (typeRaw as NormalizedBenefit['type'])
      : 'OTHER'
  return {
    type,
    amountBase: num(b?.Value),
    unit: text(b?.Unit) || undefined,
    additionalInformation: text(b?.AdditionalInformation) || undefined,
  }
}

export const dingConnector: ProviderConnector = {
  adapterKey: 'ding',

  async fetchRawPlans(config: ProviderConfig, options?: FetchRawPlansOptions): Promise<RawPlanRecord[]> {
    const auth = config.auth
    console.log('[Ding Sync] Initiating fetchRawPlans execution...')
    console.log('[Ding Sync] Config base URL:', config.baseUrl)
    console.log('[Ding Sync] Auth config parameters present:', !!auth)

    // Seamlessly inject dynamic DB credentials into process.env for getAccessToken()
    if (auth?.apiKey) {
      process.env.DING_API_KEY = auth.apiKey
      console.log('[Ding Sync] Injected DING_API_KEY from database config')
    }
    if (auth?.clientId) {
      process.env.DING_CLIENT_ID = auth.clientId
      console.log('[Ding Sync] Injected DING_CLIENT_ID')
    }
    if (auth?.clientSecret) {
      process.env.DING_CLIENT_SECRET = auth.clientSecret
      console.log('[Ding Sync] Injected DING_CLIENT_SECRET')
    }
    if (config.baseUrl) {
      process.env.DING_API_BASE_URL = config.baseUrl
    }

    let countries = options?.countries || config.supportedCountries || []
    console.log('[Ding Sync] Initial resolved countries list:', countries)

    const rawPlans: RawPlanRecord[] = []

    if (countries.length === 0 || countries.length > 5) {
      console.log('[Ding Sync] Syncing globally in a single API call for all countries...')
      try {
        const products = await getProducts()
        const items = Array.isArray(products) ? products : []
        console.log(`[Ding Sync] Received ${items.length} total raw products from Ding API globally.`)
        
        const countryFilter = countries.length > 0 ? new Set(countries.map(c => toPublicCountryCode(c).toUpperCase())) : null

        for (const p of items) {
          const region = text(p?.RegionCode).toUpperCase()
          if (!region) continue
          if (countryFilter && !countryFilter.has(region)) continue

          rawPlans.push({
            providerPlanId: text(p?.SkuCode),
            raw: { ...p, CountryIso: region, CountryIso3: normalizeCountryIso3(region) },
          })
        }
      } catch (err) {
        console.error('[Ding Sync] Failed to fetch global products:', err)
      }
    } else {
      console.log(`[Ding Sync] Syncing in parallel for ${countries.length} specific countries...`)
      await Promise.all(
        countries.map(async (country) => {
          try {
            const countryIso2 = toPublicCountryCode(country)
            console.log(`[Ding Sync] Querying operator products for country: ${country} (${countryIso2})...`)
            const products = await getProducts(countryIso2)
            const items = Array.isArray(products) ? products : []
            console.log(`[Ding Sync] Received ${items.length} raw products for country: ${country}`)

            for (const p of items) {
              rawPlans.push({
                providerPlanId: text(p?.SkuCode),
                raw: { ...p, CountryIso: countryIso2, CountryIso3: normalizeCountryIso3(country) },
              })
            }
          } catch (err) {
            console.error(`[Ding Sync] Failed to fetch products for country ${country}:`, err)
          }
        })
      )
    }

    console.log(`[Ding Sync] Finished fetchRawPlans. Total raw plan records accumulated: ${rawPlans.length}`)
    return rawPlans
  },

  async normalizePlans({ config, raw }): Promise<NormalizedPlan[]> {
    console.log(`[Ding Sync] Initiating normalizePlans execution for ${raw.length} raw records...`)

    const providerNameByCode = new Map<string, string>()
    const countriesInBatch = new Set(
      raw
        .map((r) => text((r.raw as any)?.CountryIso3 || normalizeCountryIso3((r.raw as any)?.CountryIso)))
        .filter(Boolean),
    )

    if (countriesInBatch.size > 5) {
      console.log('[Ding Sync] Loading provider/operator names globally in a single API call...')
      try {
        const providers = await getProviders()
        console.log(`[Ding Sync] Received ${providers.length} total providers globally.`)
        for (const provider of providers as DingProvider[]) {
          const code = text(provider.ProviderCode)
          const label = text(provider.ShortName) || text(provider.Name)
          if (code && label) providerNameByCode.set(code, label)
        }
      } catch (err) {
        console.warn('[Ding Sync] Could not load global provider names:', err)
      }
    } else {
      console.log(`[Ding Sync] Loading provider/operator names in parallel for ${countriesInBatch.size} countries...`)
      await Promise.all(
        Array.from(countriesInBatch).map(async (countryIso3) => {
          const countryIso2 = toPublicCountryCode(countryIso3)
          try {
            const providers = await getProviders(countryIso2)
            for (const provider of providers as DingProvider[]) {
              const code = text(provider.ProviderCode)
              const label = text(provider.ShortName) || text(provider.Name)
              if (code && label) providerNameByCode.set(code, label)
            }
          } catch (err) {
            console.warn(`[Ding Sync] Could not load provider names for ${countryIso3}:`, err)
          }
        })
      )
    }

    const normalizedList = raw
      .map((r, index) => {
        const p: any = r.raw ?? {}
        const providerPlanId = text(p?.SkuCode)
        if (!providerPlanId) {
          console.warn(`[Ding Sync] Skipping record index ${index}: SkuCode is missing`)
          return null
        }

        const countryIso3 = text(p?.CountryIso3 || normalizeCountryIso3(p?.CountryIso || config.supportedCountries[0])).toUpperCase()
        const operatorId = text(p?.ProviderCode)
        if (!countryIso3 || !operatorId) {
          console.warn(`[Ding Sync] Skipping plan ${providerPlanId}: countryIso3 (${countryIso3}) or operatorId (${operatorId}) missing`)
          return null
        }

        const benefits = asArr(p?.Benefits).map((b: any) => toBenefit(b))
        const hasData = benefits.some((b) => b.type === 'DATA')

        const validityDays = parseValidityDays(p?.ValidityPeriodIso)

        const retailAmount = num(p?.Minimum?.SendValue) || 0
        const rawWholesale = retailAmount * (1 - (num(p?.CommissionRate) || 0) / 100)
        const wholesaleAmount = Math.round(rawWholesale * 100) / 100

        const providerOperatorName =
          providerNameByCode.get(operatorId) ||
          text(p?.LocalizationKey)?.split(/\d/)[0]?.trim() ||
          operatorId.replace(/[_-]+/g, ' ')
        const planDisplayName = text(p?.DefaultDisplayText) || undefined

        return {
          providerId: config.id,
          providerCode: config.code,
          providerPlanId,
          countryIso3,
          operatorRef: `ding:${operatorId}`,
          operatorName: providerOperatorName,
          service: hasData ? 'Data' : 'Mobile',
          planType: hasData ? 'DATA' : 'AIRTIME',
          name: planDisplayName,
          description: planDisplayName,
          destinationAmount: num(p?.Minimum?.ReceiveValue),
          destinationUnit: text(p?.Minimum?.ReceiveCurrencyIso) || undefined,
          retailAmount,
          retailCurrency: text(p?.Minimum?.SendCurrencyIso) || undefined,
          wholesaleAmount,
          wholesaleCurrency: text(p?.Minimum?.SendCurrencyIso) || undefined,
          validityDays,
          benefits,
          requiredFields: [], // Ding standard sendsAccountNumber normalized, handled by core transfer service
          category: hasData ? 'DATA' : 'AIRTIME',
          subcategory: hasData ? 'DATA' : 'AIRTIME',
          raw: { ...p, dingProviderName: providerNameByCode.get(operatorId) ?? null, providerName: providerOperatorName },
        } satisfies NormalizedPlan
      })
      .filter(Boolean) as NormalizedPlan[]

    console.log(`[Ding Sync] Completed normalizePlans. Total successfully normalized plans: ${normalizedList.length}`)
    return normalizedList
  },
}
