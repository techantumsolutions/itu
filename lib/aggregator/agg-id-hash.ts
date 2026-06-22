/** Stable numeric id derived from provider string ids (used in agg_plans / agg_operators). */
export function stringToBigInt(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return Math.abs(hash | 0)
}

export type RawPlanAggLookup = {
  id: string
  provider_plan_id: string
  amount?: number | null
  currency?: string | null
  destination_amount?: number | null
  destination_currency?: string | null
  raw_json?: unknown
}

/** Map agg_plans.aggregator_plan_id → provider_plans_raw row. */
export async function buildRawPlanLookupByAggId(
  providerId: string,
  fetchPage: (offset: number, limit: number) => Promise<RawPlanAggLookup[]>,
): Promise<Map<number, RawPlanAggLookup>> {
  const map = new Map<number, RawPlanAggLookup>()
  const limit = 1000
  let offset = 0

  while (true) {
    const rows = await fetchPage(offset, limit)
    for (const row of rows) {
      if (row.provider_plan_id == null || row.provider_plan_id === '') continue
      const key = stringToBigInt(String(row.provider_plan_id))
      map.set(key, { id: row.id, provider_plan_id: String(row.provider_plan_id) })
    }
    if (rows.length < limit) break
    offset += limit
  }

  return map
}
