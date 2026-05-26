import { fetchAllDtoneProducts } from '@/lib/dtone'
import type { ProviderConnector, ProviderConfig, RawPlanRecord, NormalizedPlan, NormalizedBenefit, FetchRawPlansOptions } from '@/lib/providers/types'

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

function toBenefit(b: any): NormalizedBenefit {
  const typeRaw = text(b?.type).toUpperCase()
  const type =
    typeRaw === 'DATA' || typeRaw === 'VOICE' || typeRaw === 'SMS' || typeRaw === 'BONUS' || typeRaw === 'COMBO' || typeRaw === 'AIRTIME'
      ? (typeRaw as NormalizedBenefit['type'])
      : 'OTHER'
  return {
    type,
    amountBase: num(b?.amount?.base),
    promotionBonus: num(b?.amount?.promotion_bonus),
    totalExcludingTax: num(b?.amount?.total_excluding_tax),
    totalIncludingTax: num(b?.amount?.total_including_tax),
    unit: text(b?.unit) || undefined,
    unitType: text(b?.unit_type) || undefined,
    additionalInformation: text(b?.additional_information) || undefined,
  }
}

export const dtoneConnector: ProviderConnector = {
  adapterKey: 'dtone',

  async fetchRawPlans(config: ProviderConfig, options?: FetchRawPlansOptions): Promise<RawPlanRecord[]> {
    const a = config.auth
    const data = await fetchAllDtoneProducts(
      {
        apiKey: a?.apiKey,
        apiSecret: a?.apiSecret,
        baseUrl: config.baseUrl,
      },
      options?.countries,
    )
    const items = Array.isArray(data) ? (data as any[]) : []
    return items.map((p) => ({ providerPlanId: text(p?.id), raw: p }))
  },

  async normalizePlans({ config, raw }): Promise<NormalizedPlan[]> {
    return raw
      .map((r) => {
        const p: any = r.raw ?? {}
        const providerPlanId = text(p?.id)
        if (!providerPlanId) return null

        const countryIso3 = text(p?.operator?.country?.iso_code).toUpperCase()
        const operatorId = text(p?.operator?.id)
        const operatorName = text(p?.operator?.name)
        if (!countryIso3 || !operatorId) return null

        const requiredGroupsRaw = p?.required_fields?.credit_party_identifier_fields
        const requiredFields: string[][] = asArr(requiredGroupsRaw).map((g: any) => asArr(g).map((f: any) => text(f)).filter(Boolean))

        const benefits = asArr(p?.benefits).map((b: any) => toBenefit(b))

        const tags = asArr(p?.tags).map((t) => text(t).toUpperCase()).filter(Boolean)
        const zones = asArr(p?.availability_zones).map((z) => text(z).toUpperCase()).filter(Boolean)

        const validityQty = num(p?.validity?.quantity)
        const validityUnit = text(p?.validity?.unit).toUpperCase()
        const validityDays =
          validityQty && validityUnit === 'DAY' ? validityQty : validityQty && validityUnit === 'DAYS' ? validityQty : undefined

        return {
          providerId: config.id,
          providerCode: config.code,
          providerPlanId,
          countryIso3,
          operatorRef: `dtone:${operatorId}`, // provider-agnostic operatorRef
          operatorName: operatorName || undefined,
          service: text(p?.service?.name) || 'Mobile',
          subservice: text(p?.service?.subservice?.name) || undefined,
          planType: text(p?.type) || 'UNKNOWN',
          availabilityZones: zones,
          tags,
          name: text(p?.name) || undefined,
          description: text(p?.description) || undefined,
          destinationAmount: num(p?.destination?.amount),
          destinationUnit: text(p?.destination?.unit) || undefined,
          retailAmount: num(p?.prices?.retail?.amount),
          retailCurrency: text(p?.prices?.retail?.unit) || undefined,
          wholesaleAmount: num(p?.prices?.wholesale?.amount),
          wholesaleCurrency: text(p?.prices?.wholesale?.unit) || undefined,
          validityDays,
          benefits,
          requiredFields,
          raw: p,
        } satisfies NormalizedPlan
      })
      .filter(Boolean) as NormalizedPlan[]
  },
}

