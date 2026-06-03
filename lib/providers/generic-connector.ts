import { normalizeCountryIso3, toPublicCountryCode } from '@/lib/lcr/countries'
import { executeGenericRequest, fetchGenericCatalog, type ApiRequestConfig, type EndpointConfig } from '@/lib/providers/generic-client'
import { dtoneConnector } from '@/lib/providers/dtone-connector'
import { dingConnector } from '@/lib/providers/ding-connector'
import { valuetopupConnector } from '@/lib/providers/valuetopup-connector'
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

function getPathValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

function evaluateFormula(formula: string, item: any): number | undefined {
  try {
    const pathRegex = /[a-zA-Z_][a-zA-Z0-9_.]*/g
    const evaluated = formula.replace(pathRegex, (match) => {
      const val = getPathValue(item, match)
      return val !== undefined ? String(val) : '0'
    })
    if (/^[0-9.+\-*/()\s]+$/.test(evaluated)) {
      return new Function(`return (${evaluated})`)()
    }
  } catch (e) {
    console.error(`Failed to evaluate formula: ${formula}`, e)
  }
  return undefined
}

// Built-in dynamic configuration maps for known providers
export interface BuiltInProviderConfig {
  authType: ApiRequestConfig['authType']
  defaultBaseUrl: string
  endpoints: {
    getProducts: EndpointConfig
    getProviders?: EndpointConfig
  }
  mappings: {
    providerPlanId: string
    countryIso3: string
    operatorRef: string
    operatorName?: string
    service?: string
    planType?: string
    retailAmount: string
    retailCurrency?: string
    wholesaleAmount?: string
    wholesaleCurrency?: string
    destinationAmount?: string
    destinationUnit?: string
    validityDays?: string
  }
}

export const BUILT_IN_CONFIGS: Record<string, BuiltInProviderConfig> = {
  dtone: {
    authType: 'basic',
    defaultBaseUrl: 'https://prepaid.dtone.com',
    endpoints: {
      getProducts: {
        path: '/v1/products',
        method: 'GET',
        pagination: 'page_header'
      }
    },
    mappings: {
      providerPlanId: 'id',
      countryIso3: 'operator.country.iso_code',
      operatorRef: 'operator.id',
      operatorName: 'operator.name',
      service: 'service.name',
      planType: 'type',
      retailAmount: 'prices.retail.amount',
      retailCurrency: 'prices.retail.unit',
      wholesaleAmount: 'prices.wholesale.amount',
      wholesaleCurrency: 'prices.wholesale.unit',
      destinationAmount: 'destination.amount',
      destinationUnit: 'destination.unit',
      validityDays: 'validity.quantity'
    }
  },
  valuetopup: {
    authType: 'basic',
    defaultBaseUrl: 'https://sandbox.valuetopup.com/api/v2',
    endpoints: {
      getProducts: {
        path: '/catalog/skus',
        method: 'GET',
        responsePath: 'payLoad',
        pagination: 'none'
      }
    },
    mappings: {
      providerPlanId: 'skuId',
      countryIso3: 'countryCode',
      operatorRef: 'operatorId',
      operatorName: 'operatorName',
      service: 'category',
      planType: 'category',
      retailAmount: 'min.faceValue',
      retailCurrency: 'min.faceValueCurrency',
      wholesaleAmount: 'min.faceValue * (1 - discount / 100)',
      wholesaleCurrency: 'min.faceValueCurrency'
    }
  },
  ding: {
    authType: 'apiKey',
    defaultBaseUrl: 'https://api.dingconnect.com',
    endpoints: {
      getProducts: {
        path: '/api/V1/GetProducts',
        method: 'GET',
        responsePath: 'Items',
        pagination: 'none'
      },
      getProviders: {
        path: '/api/V1/GetProviders',
        method: 'GET',
        responsePath: 'Items',
        pagination: 'none'
      }
    },
    mappings: {
      providerPlanId: 'SkuCode',
      countryIso3: 'RegionCode',
      operatorRef: 'ProviderCode',
      operatorName: 'DefaultDisplayText',
      service: 'Benefits',
      planType: 'Benefits',
      retailAmount: 'Minimum.SendValue',
      retailCurrency: 'Minimum.SendCurrencyIso',
      wholesaleAmount: 'Minimum.SendValue * (1 - CommissionRate / 100)',
      wholesaleCurrency: 'Minimum.SendCurrencyIso',
      destinationAmount: 'Minimum.ReceiveValue',
      destinationUnit: 'Minimum.ReceiveCurrencyIso',
      validityDays: 'ValidityPeriodIso'
    }
  }
}

export function resolveMetadataConfig(config: ProviderConfig): BuiltInProviderConfig {
  const adapterKey = config.adapterKey
  const builtIn = BUILT_IN_CONFIGS[adapterKey]
  
  // Custom syncConfig can be stored inside config.auth.extra or a parsed JSON
  const customConfig = (config.auth as any)?.syncConfig || (config.auth?.extra as any)?.syncConfig

  if (!builtIn && !customConfig) {
    throw new Error(`No sync configuration metadata found for provider adapter: ${adapterKey}`)
  }

  const resolved = {
    ...(builtIn || {}),
    ...(customConfig || {})
  } as BuiltInProviderConfig

  return resolved
}

export function buildApiClientConfig(config: ProviderConfig, resolvedMeta: BuiltInProviderConfig): ApiRequestConfig {
  const auth = config.auth
  let authType = resolvedMeta.authType
  if (auth?.kind && auth.kind !== 'custom') {
    authType = auth.kind === 'apiKey' ? 'apiKey' : auth.kind === 'basic' ? 'basic' : 'bearer'
  }

  const headerName = authType === 'apiKey' ? ((auth as any)?.headerName || 'api_key') : undefined

  return {
    baseUrl: config.baseUrl || resolvedMeta.defaultBaseUrl,
    authType,
    authParams: {
      apiKey: auth?.apiKey,
      apiSecret: auth?.apiSecret,
      clientId: auth?.clientId,
      clientSecret: auth?.clientSecret,
      token: auth?.token,
      headerName,
    }
  }
}

export const genericConnector: ProviderConnector = {
  adapterKey: 'custom',

  async fetchRawPlans(config: ProviderConfig, options?: FetchRawPlansOptions): Promise<RawPlanRecord[]> {
    const meta = resolveMetadataConfig(config)
    const apiConfig = buildApiClientConfig(config, meta)

    console.log(`[Generic Sync] Ingesting catalog for provider ${config.code}...`)

    const countries = options?.countries || config.supportedCountries || []
    const rawPlans: RawPlanRecord[] = []

    const endpoint = meta.endpoints.getProducts

    // 1. If provider is Ding and we have specific countries:
    if (config.adapterKey === 'ding' && countries.length > 0 && countries.length <= 5) {
      console.log(`[Generic Sync] Querying specific countries in parallel for Ding: ${countries.join(', ')}`)
      await Promise.all(
        countries.map(async (c) => {
          try {
            const countryIso2 = toPublicCountryCode(c)
            const products = await fetchGenericCatalog(apiConfig, endpoint, { countryIsos: countryIso2 })
            for (const p of products) {
              rawPlans.push({
                providerPlanId: text(getPathValue(p, meta.mappings.providerPlanId)),
                raw: { ...p, CountryIso: countryIso2, CountryIso3: normalizeCountryIso3(c) }
              })
            }
          } catch (err: any) {
            console.error(`[Generic Sync] Failed to fetch for country ${c}:`, err.message)
          }
        })
      )
    } 
    // 2. If provider is DT One and we have specific countries:
    else if (config.adapterKey === 'dtone' && countries.length > 0 && countries.length <= 5) {
      console.log(`[Generic Sync] Querying specific countries in parallel for DT One: ${countries.join(', ')}`)
      await Promise.all(
        countries.map(async (c) => {
          try {
            const countryIso3 = normalizeCountryIso3(c)
            const products = await fetchGenericCatalog(apiConfig, endpoint, { country_iso_code: countryIso3 })
            for (const p of products) {
              rawPlans.push({
                providerPlanId: text(getPathValue(p, meta.mappings.providerPlanId)),
                raw: p
              })
            }
          } catch (err: any) {
            console.error(`[Generic Sync] Failed to fetch for country ${c}:`, err.message)
          }
        })
      )
    }
    // 3. Fallback to global fetch (e.g. Value Topup or when no/many countries specified)
    else {
      console.log(`[Generic Sync] Fetching catalog using global endpoint: ${endpoint.path}`)
      const queryParams: Record<string, string> = {}

      const products = await fetchGenericCatalog(apiConfig, endpoint, queryParams)
      const countryFilter = countries.length > 0 ? new Set(countries.map(c => normalizeCountryIso3(c))) : null

      for (const p of products) {
        const rawCountryVal = text(getPathValue(p, meta.mappings.countryIso3) || p?.CountryIso || p?.RegionCode)
        const countryIso3 = normalizeCountryIso3(rawCountryVal)
        
        if (countryFilter && !countryFilter.has(countryIso3)) continue

        rawPlans.push({
          providerPlanId: text(getPathValue(p, meta.mappings.providerPlanId)),
          raw: { ...p, CountryIso: toPublicCountryCode(countryIso3), CountryIso3: countryIso3 }
        })
      }
    }

    console.log(`[Generic Sync] Total raw records retrieved: ${rawPlans.length}`)
    return rawPlans
  },

  async normalizePlans({ config, raw }): Promise<NormalizedPlan[]> {
    if (config.adapterKey === 'dtone') {
      return dtoneConnector.normalizePlans({ config, raw })
    }
    if (config.adapterKey === 'ding') {
      return dingConnector.normalizePlans({ config, raw })
    }
    if (config.adapterKey === 'valuetopup') {
      return valuetopupConnector.normalizePlans({ config, raw })
    }

    const meta = resolveMetadataConfig(config)
    const apiConfig = buildApiClientConfig(config, meta)

    console.log(`[Generic Sync] Normalizing ${raw.length} plans...`)

    // Load operator names for mapping if getProviders endpoint exists (e.g. Ding)
    const providerNameByCode = new Map<string, string>()
    if (meta.endpoints.getProviders) {
      try {
        console.log(`[Generic Sync] Pre-fetching provider names using getProviders...`)
        const providers = await fetchGenericCatalog(apiConfig, meta.endpoints.getProviders)
        for (const prov of providers) {
          const code = text(prov.ProviderCode)
          const label = text(prov.ShortName) || text(prov.Name)
          if (code && label) providerNameByCode.set(code, label)
        }
      } catch (err: any) {
        console.warn(`[Generic Sync] Could not fetch provider names:`, err.message)
      }
    }

    return raw
      .map((r) => {
        const p = r.raw as any
        const m = meta.mappings

        const providerPlanId = text(getPathValue(p, m.providerPlanId))
        if (!providerPlanId) return null

        const rawCountry = text(getPathValue(p, m.countryIso3) || p.CountryIso || p.RegionCode)
        const countryIso3 = normalizeCountryIso3(rawCountry)
        const operatorId = text(getPathValue(p, m.operatorRef))
        if (!countryIso3 || !operatorId) return null

        // Prices
        const retailAmount = num(getPathValue(p, m.retailAmount)) || 0
        const retailCurrency = text(getPathValue(p, m.retailCurrency)) || 'USD'

        let wholesaleAmount = retailAmount
        if (m.wholesaleAmount) {
          if (m.wholesaleAmount.includes('*') || m.wholesaleAmount.includes('/')) {
            wholesaleAmount = num(evaluateFormula(m.wholesaleAmount, p)) ?? retailAmount
          } else {
            wholesaleAmount = num(getPathValue(p, m.wholesaleAmount)) ?? retailAmount
          }
        }
        wholesaleAmount = Math.round(wholesaleAmount * 100) / 100
        const wholesaleCurrency = text(getPathValue(p, m.wholesaleCurrency)) || retailCurrency

        // Service & Plan Type mapping
        let service = 'Mobile'
        const rawService = text(getPathValue(p, m.service || 'category')).toUpperCase()
        if (rawService === 'ESIM') service = 'eSIM'
        else if (rawService.includes('DATA')) service = 'Data'

        let planType = 'AIRTIME'
        if (rawService.includes('PIN')) planType = 'PIN'
        else if (rawService.includes('DATA')) planType = 'DATA'

        // Operators Name mapping
        const providerOperatorName = providerNameByCode.get(operatorId) ||
          text(getPathValue(p, m.operatorName || 'operatorName')) ||
          operatorId.replace(/[_-]+/g, ' ')

        // Benefits
        const benefits: NormalizedBenefit[] = []
        const rawBenefits = p.Benefits || p.benefits || p.BenefitsJson
        if (Array.isArray(rawBenefits)) {
          for (const b of rawBenefits) {
            if (typeof b === 'string') {
              benefits.push({ type: b === 'DigitalProduct' ? 'COMBO' : 'OTHER', amountBase: retailAmount, unit: retailCurrency })
            } else if (b && typeof b === 'object') {
              const bType = text(b.Type || b.type).toUpperCase()
              const type = (bType === 'DATA' || bType === 'VOICE' || bType === 'SMS' || bType === 'BONUS' || bType === 'COMBO' || bType === 'AIRTIME')
                ? bType as NormalizedBenefit['type']
                : 'OTHER'
              benefits.push({
                type,
                amountBase: num(b.Value || b.value || getPathValue(b, 'amount.base')),
                unit: text(b.Unit || b.unit),
                additionalInformation: text(b.AdditionalInformation || b.additional_information) || undefined
              })
            }
          }
        }

        // Validity Days parsing
        let validityDays: number | undefined
        const rawValidity = getPathValue(p, m.validityDays || 'validity.quantity')
        if (typeof rawValidity === 'number') {
          validityDays = rawValidity
        } else if (typeof rawValidity === 'string' && rawValidity.startsWith('P')) {
          // ISO 8601 Duration parsing
          const match = rawValidity.match(/P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?/)
          if (match) {
            const y = num(match[1]) || 0
            const m = num(match[2]) || 0
            const d = num(match[3]) || 0
            validityDays = y * 365 + m * 30 + d
          }
        }

        return {
          providerId: config.id,
          providerCode: config.code,
          providerPlanId,
          countryIso3,
          operatorRef: `${config.adapterKey}:${operatorId}`,
          operatorName: providerOperatorName || undefined,
          service,
          planType,
          name: text(getPathValue(p, m.name || 'DefaultDisplayText') || p.skuName || p.productName || p.name),
          description: text(getPathValue(p, m.description || 'DefaultDisplayText') || p.additionalInformation),
          retailAmount,
          retailCurrency,
          wholesaleAmount,
          wholesaleCurrency,
          destinationAmount: num(getPathValue(p, m.destinationAmount)),
          destinationUnit: text(getPathValue(p, m.destinationUnit)) || undefined,
          validityDays,
          benefits,
          requiredFields: planType === 'PIN' ? [] : [['account']],
          raw: p
        } satisfies NormalizedPlan
      })
      .filter(Boolean) as NormalizedPlan[]
  }
}
