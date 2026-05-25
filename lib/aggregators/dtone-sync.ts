import { fetchDtoneProducts } from '@/lib/dtone'
import {
  dbLogAggApi,
  dbReplaceAggPlanBenefits,
  dbReplaceAggPlanRequiredFields,
  dbSetAggPlansInactiveExcept,
  dbUpsertAggCountries,
  dbUpsertAggOperators,
  dbUpsertAggPlans,
  dbUpsertAggServices,
  dbUpsertAggSubservices,
  type AggProvider,
} from '@/lib/db/agg-catalog'

type DtoneProduct = Record<string, any>

function text(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

export type DtoneSyncResult = {
  provider: AggProvider
  fetched: number
  upsertedOperators: number
  upsertedPlans: number
  durationMs: number
}

export async function syncDtoneCatalog(): Promise<DtoneSyncResult> {
  const provider: AggProvider = 'dtone'
  const started = Date.now()
  const endpoint = '/v1/products'

  try {
    const t0 = Date.now()
    const data = await fetchDtoneProducts()
    const duration = Date.now() - t0
    const products: DtoneProduct[] = Array.isArray(data) ? (data as DtoneProduct[]) : []

    // Countries/operators/services are inferred from products.
    const countries = new Map<string, { iso3: string; name: string; raw_response: unknown }>()
    const operators = new Map<string, { aggregator_operator_id: number; country_iso3: string; name: string; raw_response: unknown }>()
    const services = new Map<string, { service_id: number; name: string; raw_response: unknown }>()
    const subservices = new Map<string, { subservice_id: number; service_id: number; name: string; raw_response: unknown }>()

    for (const p of products) {
      const cIso3 = text(p?.operator?.country?.iso_code).toUpperCase()
      const cName = text(p?.operator?.country?.name).trim()
      if (cIso3 && cName) {
        countries.set(cIso3, { iso3: cIso3, name: cName, raw_response: p?.operator?.country ?? {} })
      }

      const opId = num(p?.operator?.id)
      const opName = text(p?.operator?.name).trim()
      if (opId != null && cIso3 && opName) {
        operators.set(`${provider}:${opId}`, {
          aggregator_operator_id: opId,
          country_iso3: cIso3,
          name: opName,
          raw_response: p?.operator ?? {},
        })
      }

      const sId = num(p?.service?.id)
      const sName = text(p?.service?.name).trim()
      if (sId != null && sName) {
        services.set(`${provider}:${sId}`, { service_id: sId, name: sName, raw_response: p?.service ?? {} })
      }

      const ssId = num(p?.service?.subservice?.id)
      const ssName = text(p?.service?.subservice?.name).trim()
      if (ssId != null && sId != null && ssName) {
        subservices.set(`${provider}:${ssId}`, {
          subservice_id: ssId,
          service_id: sId,
          name: ssName,
          raw_response: p?.service?.subservice ?? {},
        })
      }
    }

    await dbLogAggApi({
      provider,
      endpoint,
      method: 'GET',
      status: 200,
      duration_ms: duration,
      response: { fetched: products.length },
    })

    await dbUpsertAggCountries(Array.from(countries.values()))
    const upsertedOps = await dbUpsertAggOperators(
      Array.from(operators.values()).map((o) => ({
        provider,
        aggregator_operator_id: o.aggregator_operator_id,
        country_iso3: o.country_iso3,
        name: o.name,
        regions: [],
        raw_response: o.raw_response,
      }))
    )
    await dbUpsertAggServices(Array.from(services.values()).map((s) => ({ provider, ...s })))
    await dbUpsertAggSubservices(Array.from(subservices.values()).map((s) => ({ provider, ...s })))

    const operatorIdByAggId = new Map<number, string>()
    for (const row of upsertedOps ?? []) {
      if (row && typeof row.aggregator_operator_id === 'number' && typeof row.id === 'string') {
        operatorIdByAggId.set(row.aggregator_operator_id, row.id)
      }
    }

    const planRows = products
      .map((p) => {
        const planId = num(p?.id)
        const opAggId = num(p?.operator?.id)
        if (planId == null || opAggId == null) return null
        const operator_id = operatorIdByAggId.get(opAggId)
        if (!operator_id) return null

        const serviceId = num(p?.service?.id)
        const subserviceId = num(p?.service?.subservice?.id)

        const zones = asArr(p?.availability_zones).map((z) => text(z)).filter(Boolean)
        const tags = asArr(p?.tags).map((t) => text(t)).filter(Boolean)

        return {
          provider,
          aggregator_plan_id: planId,
          operator_id,
          service_id: serviceId,
          subservice_id: subserviceId,
          type: text(p?.type || 'UNKNOWN'),
          name: text(p?.name || p?.description || String(planId)),
          description: text(p?.description) || null,
          availability_zones: zones,
          destination_amount: num(p?.destination?.amount),
          destination_unit: text(p?.destination?.unit) || null,
          destination_unit_type: text(p?.destination?.unit_type) || null,
          retail_amount: num(p?.prices?.retail?.amount),
          retail_fee: num(p?.prices?.retail?.fee),
          wholesale_amount: num(p?.prices?.wholesale?.amount),
          wholesale_fee: num(p?.prices?.wholesale?.fee),
          source_amount: num(p?.source?.amount),
          source_unit: text(p?.source?.unit) || null,
          currency_unit: text(p?.prices?.retail?.unit || p?.source?.unit) || null,
          rate_base: num(p?.rates?.base),
          rate_retail: num(p?.rates?.retail),
          rate_wholesale: num(p?.rates?.wholesale),
          validity_quantity: num(p?.validity?.quantity),
          validity_unit: text(p?.validity?.unit) || null,
          tags,
          raw_response: p,
        }
      })
      .filter(Boolean) as any[]

    const upsertedPlans = await dbUpsertAggPlans(planRows)
    const planIdByAggId = new Map<number, string>()
    for (const row of upsertedPlans ?? []) {
      if (row && typeof row.aggregator_plan_id === 'number' && typeof row.id === 'string') {
        planIdByAggId.set(row.aggregator_plan_id, row.id)
      }
    }

    // Benefits + required fields (best-effort per plan)
    for (const p of products) {
      const planAggId = num(p?.id)
      if (planAggId == null) continue
      const planDbId = planIdByAggId.get(planAggId)
      if (!planDbId) continue

      const benefits = asArr(p?.benefits).map((b: any) => ({
        type: text(b?.type),
        amount_base: num(b?.amount?.base),
        promotion_bonus: num(b?.amount?.promotion_bonus),
        total_excluding_tax: num(b?.amount?.total_excluding_tax),
        total_including_tax: num(b?.amount?.total_including_tax),
        unit: text(b?.unit) || null,
        unit_type: text(b?.unit_type) || null,
        additional_information: text(b?.additional_information) || null,
        raw_response: b,
      }))

      const groupsRaw = p?.required_fields?.credit_party_identifier_fields
      const groups: string[][] = asArr(groupsRaw).map((g: any) => asArr(g).map((f: any) => text(f)).filter(Boolean))

      // Make per-plan normalization resilient; don't fail whole sync because of one bad record.
      try {
        await dbReplaceAggPlanBenefits(planDbId, benefits)
      } catch {
        // ignored; logs already capture the raw response at plan level
      }
      try {
        await dbReplaceAggPlanRequiredFields(planDbId, groups)
      } catch {
        // ignored
      }
    }

    // Deactivate plans not present in latest fetch.
    await dbSetAggPlansInactiveExcept(
      provider,
      planRows.map((r) => r.aggregator_plan_id)
    )

    return {
      provider,
      fetched: products.length,
      upsertedOperators: upsertedOps?.length ?? 0,
      upsertedPlans: upsertedPlans?.length ?? 0,
      durationMs: Date.now() - started,
    }
  } catch (error) {
    await dbLogAggApi({
      provider,
      endpoint,
      method: 'GET',
      status: 500,
      error: error instanceof Error ? error.message : 'sync failed',
    }).catch(() => {})
    throw error
  }
}

