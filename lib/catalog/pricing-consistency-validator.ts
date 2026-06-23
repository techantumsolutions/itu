import { supabaseRest } from '@/lib/db/supabase-rest'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'
import { planMappingPricingKey } from '@/lib/catalog/provider-wholesale-pricing'
import { batchResolvePlanMappingPricing } from '@/lib/routing/plan-mapping-pricing'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type PricingConsistencyMismatch = {
  systemPlanId: string
  internalPlanId: string
  providerId: string
  providerPlanId: string
  field: string
  rawValue: string | number | null
  mappingValue: string | number | null
  internalMappingValue: string | number | null
}

export type PricingConsistencyReport = {
  providerId: string
  scanned: number
  mismatches: PricingConsistencyMismatch[]
  ok: boolean
}

function normAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 10000) / 10000
}

function normCurrency(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase()
  return code || null
}

function valuesDiffer(a: unknown, b: unknown, kind: 'amount' | 'currency'): boolean {
  if (kind === 'amount') {
    const na = normAmount(a)
    const nb = normAmount(b)
    if (na == null && nb == null) return false
    if (na == null || nb == null) return true
    return Math.abs(na - nb) > 0.01
  }
  return normCurrency(a) !== normCurrency(b)
}

/**
 * Validate pricing chain consistency without modifying data:
 * provider_plans_raw → plan_mappings → internal_plan_provider_mapping
 */
export async function validateProviderPricingConsistency(
  providerId: string,
): Promise<PricingConsistencyReport> {
  const mismatches: PricingConsistencyMismatch[] = []

  const mapRes = await supabaseRest(
    `plan_mappings?service_provider_id=eq.${enc(providerId)}&select=system_plan_id,service_provider_id,provider_plan_id,provider_plan_raw_id,system_plans(internal_plan_id)`,
    { cache: 'no-store' },
  )
  if (!mapRes.ok) {
    return { providerId, scanned: 0, mismatches: [], ok: true }
  }

  const rows = (await mapRes.json()) as Array<{
    system_plan_id: string
    service_provider_id: string
    provider_plan_id?: string | null
    provider_plan_raw_id?: string | null
    system_plans?: { internal_plan_id?: string | null } | Array<{ internal_plan_id?: string | null }> | null
  }>

  const lookups: Array<{ planId: string; providerId: string; providerPlanId: string | null }> = []
  for (const row of rows) {
    const systemPlan = Array.isArray(row.system_plans) ? row.system_plans[0] : row.system_plans
    const internalPlanId = systemPlan?.internal_plan_id
    if (!internalPlanId || !row.provider_plan_id) continue
    lookups.push({
      planId: internalPlanId,
      providerId: row.service_provider_id,
      providerPlanId: row.provider_plan_id,
    })
  }

  const resolvedByKey = await batchResolvePlanMappingPricing(lookups)

  let scanned = 0
  for (const row of rows) {
    const systemPlan = Array.isArray(row.system_plans) ? row.system_plans[0] : row.system_plans
    const internalPlanId = systemPlan?.internal_plan_id
    const providerPlanId = row.provider_plan_id
    if (!internalPlanId || !providerPlanId || !row.provider_plan_raw_id) continue

    scanned++

    const rawRes = await supabaseRest(
      `provider_plans_raw?id=eq.${enc(row.provider_plan_raw_id)}&select=provider_plan_id,amount,currency,destination_amount,destination_currency,raw_json&limit=1`,
      { cache: 'no-store' },
    )
    const rawRows = rawRes.ok ? ((await rawRes.json()) as Array<Record<string, unknown>>) : []
    const rawPlan = rawRows[0]
    if (!rawPlan) continue

    const rawPricing = resolveWholesalePricing({
      rawJson: rawPlan.raw_json,
      amount: rawPlan.amount as number | null,
      currency: rawPlan.currency as string | null,
      destinationAmount: rawPlan.destination_amount as number | null,
      destinationCurrency: rawPlan.destination_currency as string | null,
    })

    const resolved =
      resolvedByKey.get(planMappingPricingKey(internalPlanId, providerId, providerPlanId)) ??
      resolvedByKey.get(planMappingPricingKey(internalPlanId, providerId, null))

    const internalRes = await supabaseRest(
      `internal_plan_provider_mapping?internal_plan_id=eq.${enc(internalPlanId)}&provider_id=eq.${enc(providerId)}&provider_plan_id=eq.${enc(providerPlanId)}&select=provider_plan_id,provider_price,provider_currency&limit=1`,
      { cache: 'no-store' },
    )
    const internalRows = internalRes.ok
      ? ((await internalRes.json()) as Array<{
          provider_plan_id?: string
          provider_price?: number | null
          provider_currency?: string | null
        }>)
      : []
    const internalMapping = internalRows[0]

    const checks: Array<{
      field: string
      rawValue: string | number | null
      mappingValue: string | number | null
      internalMappingValue: string | number | null
      kind: 'amount' | 'currency'
    }> = [
      {
        field: 'provider_plan_id',
        rawValue: String(rawPlan.provider_plan_id ?? ''),
        mappingValue: providerPlanId,
        internalMappingValue: internalMapping?.provider_plan_id ?? null,
        kind: 'currency',
      },
      {
        field: 'provider_wholesale_amount',
        rawValue: rawPricing.wholesaleAmount,
        mappingValue: resolved?.wholesaleAmount ?? null,
        internalMappingValue: internalMapping?.provider_price ?? null,
        kind: 'amount',
      },
      {
        field: 'provider_wholesale_currency',
        rawValue: rawPricing.wholesaleCurrency,
        mappingValue: resolved?.wholesaleCurrency ?? null,
        internalMappingValue: internalMapping?.provider_currency ?? null,
        kind: 'currency',
      },
      {
        field: 'destination_face_value',
        rawValue: rawPricing.destinationAmount,
        mappingValue: resolved?.destinationAmount ?? null,
        internalMappingValue: null,
        kind: 'amount',
      },
      {
        field: 'destination_currency',
        rawValue: rawPricing.destinationCurrency,
        mappingValue: resolved?.destinationCurrency ?? null,
        internalMappingValue: null,
        kind: 'currency',
      },
    ]

    for (const check of checks) {
      if (check.field === 'provider_plan_id') {
        if (
          String(check.rawValue) !== String(check.mappingValue) ||
          String(check.mappingValue) !== String(check.internalMappingValue ?? check.mappingValue)
        ) {
          mismatches.push({
            systemPlanId: row.system_plan_id,
            internalPlanId,
            providerId,
            providerPlanId,
            field: check.field,
            rawValue: check.rawValue,
            mappingValue: check.mappingValue,
            internalMappingValue: check.internalMappingValue,
          })
        }
        continue
      }

      const mappingMismatch = valuesDiffer(check.rawValue, check.mappingValue, check.kind)
      const internalMismatch =
        check.internalMappingValue != null &&
        valuesDiffer(check.rawValue, check.internalMappingValue, check.kind)

      if (mappingMismatch || internalMismatch) {
        mismatches.push({
          systemPlanId: row.system_plan_id,
          internalPlanId,
          providerId,
          providerPlanId,
          field: check.field,
          rawValue: check.rawValue,
          mappingValue: check.mappingValue,
          internalMappingValue: check.internalMappingValue,
        })
      }
    }
  }

  if (mismatches.length) {
    console.warn(
      `[Pricing Consistency] provider=${providerId} scanned=${scanned} mismatches=${mismatches.length}`,
    )
    for (const m of mismatches.slice(0, 20)) {
      console.warn(
        `[Pricing Consistency] plan=${m.systemPlanId} provider_plan=${m.providerPlanId} field=${m.field} raw=${m.rawValue} resolved=${m.mappingValue} internal=${m.internalMappingValue}`,
      )
    }
  } else if (scanned > 0) {
    console.log(`[Pricing Consistency] provider=${providerId} scanned=${scanned} ok`)
  }

  return { providerId, scanned, mismatches, ok: mismatches.length === 0 }
}
