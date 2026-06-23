import { supabaseRest } from '@/lib/db/supabase-rest'
import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'

function enc(v: string): string {
  return encodeURIComponent(v)
}

type RawPlanRow = {
  id: string
  provider_id: string
  provider_plan_id: string
  amount?: number | null
  currency?: string | null
  destination_amount?: number | null
  destination_currency?: string | null
  raw_json?: unknown
}

type PlanMappingRow = {
  system_plan_id: string
  service_provider_id: string
  provider_plan_raw_id?: string | null
  provider_plan_id?: string | null
}

export type PlanRechargeValue = {
  amount: number
  currency: string
}

/** Same recharge face-value logic as admin products provider-cost popup. */
export function rechargeValueFromRawPlan(
  raw: Pick<
    RawPlanRow,
    'amount' | 'currency' | 'destination_amount' | 'destination_currency' | 'raw_json'
  > | null | undefined,
): { amount: number | null; currency: string | null } {
  if (!raw) return { amount: null, currency: null }

  const wholesale = resolveWholesalePricing({
    rawJson: raw.raw_json,
    amount: raw.amount ?? null,
    currency: raw.currency ?? null,
    destinationAmount: raw.destination_amount ?? null,
    destinationCurrency: raw.destination_currency ?? null,
  })
  const extracted = extractPricingFromRaw(raw.raw_json ?? null)

  const amount =
    wholesale.destinationAmount ??
    raw.destination_amount ??
    extracted.basePrice ??
    extracted.finalPrice ??
    null

  const currency =
    wholesale.destinationCurrency ??
    raw.destination_currency ??
    (extracted.basePrice != null ? extracted.currency : null) ??
    null

  return { amount, currency }
}

async function fetchRawPlansByIds(ids: string[]): Promise<Map<string, RawPlanRow>> {
  const map = new Map<string, RawPlanRow>()
  if (!ids.length) return map

  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const res = await supabaseRest(
      `provider_plans_raw?id=in.(${chunk.map(enc).join(',')})&select=id,provider_id,provider_plan_id,amount,currency,destination_amount,destination_currency,raw_json`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as RawPlanRow[]
    for (const row of rows) {
      if (row.id) map.set(row.id, row)
    }
  }
  return map
}

async function fetchLatestRawPlan(
  providerId: string,
  providerPlanId: string,
): Promise<RawPlanRow | null> {
  const res = await supabaseRest(
    `provider_plans_raw?provider_id=eq.${enc(providerId)}&provider_plan_id=eq.${enc(providerPlanId)}&select=id,provider_id,provider_plan_id,amount,currency,destination_amount,destination_currency,raw_json&order=fetched_at.desc&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as RawPlanRow[]
  return rows[0] ?? null
}

/** Batch-resolve customer-facing recharge value (destination / face value) per system plan. */
export async function batchLoadSystemPlanRechargeValues(
  systemPlanIds: string[],
): Promise<Map<string, PlanRechargeValue>> {
  const result = new Map<string, PlanRechargeValue>()
  const uniqueIds = [...new Set(systemPlanIds.filter(Boolean))]
  if (!uniqueIds.length) return result

  const mappings: PlanMappingRow[] = []
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50)
    const res = await supabaseRest(
      `plan_mappings?system_plan_id=in.(${chunk.map(enc).join(',')})&select=system_plan_id,service_provider_id,provider_plan_raw_id,provider_plan_id`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    mappings.push(...((await res.json()) as PlanMappingRow[]))
  }

  const rawIds = [
    ...new Set(mappings.map((m) => m.provider_plan_raw_id).filter((id): id is string => Boolean(id))),
  ]
  const rawById = await fetchRawPlansByIds(rawIds)

  const stableFetchCache = new Map<string, RawPlanRow | null>()
  const stableKey = (providerId: string, providerPlanId: string) => `${providerId}:${providerPlanId}`

  for (const systemPlanId of uniqueIds) {
    const planMappings = mappings.filter((m) => m.system_plan_id === systemPlanId)
    for (const mapping of planMappings) {
      let raw: RawPlanRow | null = null
      if (mapping.provider_plan_raw_id) {
        raw = rawById.get(mapping.provider_plan_raw_id) ?? null
      }
      const providerPlanId = mapping.provider_plan_id?.trim()
      if (!raw && mapping.service_provider_id && providerPlanId) {
        const key = stableKey(mapping.service_provider_id, providerPlanId)
        if (!stableFetchCache.has(key)) {
          stableFetchCache.set(
            key,
            await fetchLatestRawPlan(mapping.service_provider_id, providerPlanId),
          )
        }
        raw = stableFetchCache.get(key) ?? null
      }
      if (!raw) continue

      const { amount, currency } = rechargeValueFromRawPlan(raw)
      if (amount != null && amount > 0 && currency) {
        result.set(systemPlanId, { amount, currency: currency.toUpperCase() })
        break
      }
    }
  }

  return result
}

export function formatPlanRechargeValue(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return '—'
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  const code = (currency ?? '').trim().toUpperCase()
  return code ? `${formatted} ${code}` : formatted
}

/** Resolve recharge values keyed by internal_plan.id via linked system_plans. */
export async function batchLoadInternalPlanRechargeValues(
  internalPlanIds: string[],
): Promise<Map<string, PlanRechargeValue>> {
  const result = new Map<string, PlanRechargeValue>()
  const uniqueIds = [...new Set(internalPlanIds.filter(Boolean))]
  if (!uniqueIds.length) return result

  const internalToSystem = new Map<string, string>()
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50)
    const res = await supabaseRest(
      `system_plans?internal_plan_id=in.(${chunk.map(enc).join(',')})&select=id,internal_plan_id&status=eq.ACTIVE`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{ id: string; internal_plan_id?: string | null }>
    for (const row of rows) {
      if (row.internal_plan_id && row.id) {
        internalToSystem.set(row.internal_plan_id, row.id)
      }
    }
  }

  const rechargeBySystem = await batchLoadSystemPlanRechargeValues([...internalToSystem.values()])
  for (const [internalPlanId, systemPlanId] of internalToSystem) {
    const recharge = rechargeBySystem.get(systemPlanId)
    if (recharge) result.set(internalPlanId, recharge)
  }
  return result
}

export function derivedDisplayPrices(amount: number, currency: string): { price_inr: number; price_eur: number } {
  const code = currency.toUpperCase()
  return {
    price_inr: code === 'INR' ? Math.round(amount) : Math.round(amount * 90),
    price_eur: code === 'EUR' ? Number(amount.toFixed(2)) : Number((amount / 90).toFixed(2)),
  }
}
