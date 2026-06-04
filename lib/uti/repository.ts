import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export async function dbUpsertProviderRawPlan(input: {
  providerId: string
  providerPlanId: string
  rawJson: unknown
  checksumHash: string
  status?: string
}) {
  const res = await supabaseRest('provider_plans_raw?on_conflict=provider_id,provider_plan_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      provider_id: input.providerId,
      provider_plan_id: input.providerPlanId,
      raw_json: input.rawJson,
      checksum_hash: input.checksumHash,
      status: input.status ?? 'active',
      fetched_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbFindInternalPlanByHash(normalizedHash: string) {
  const res = await supabaseRest(`internal_plans?normalized_hash=eq.${enc(normalizedHash)}&limit=1`)
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as any[]
  return rows?.[0] ?? null
}

export async function dbCreateInternalPlan(input: {
  countryIso3: string
  operatorRef: string
  service: string
  subservice?: string
  category: string
  utiPlanName: string
  utiDescription?: string
  normalizedHash: string
  canonicalSignature: string
  confidence: string
  rawResponse?: unknown
}) {
  const res = await supabaseRest('internal_plans', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      country_iso3: input.countryIso3,
      operator_ref: input.operatorRef,
      service: input.service,
      subservice: input.subservice ?? null,
      category: input.category,
      uti_plan_name: input.utiPlanName,
      uti_description: input.utiDescription ?? null,
      normalized_hash: input.normalizedHash,
      canonical_signature: input.canonicalSignature,
      confidence: input.confidence,
      raw_response: input.rawResponse ?? {},
      active: true,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as any[]
  return rows?.[0] ?? null
}

export async function dbUpsertInternalPlanMapping(input: {
  internalPlanId: string
  providerId: string
  providerPlanId: string
  providerPrice?: number
  providerCurrency?: string
  providerPriority?: number
  margin?: number
  enabled?: boolean
}) {
  const res = await supabaseRest('internal_plan_provider_mapping?on_conflict=provider_id,provider_plan_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      internal_plan_id: input.internalPlanId,
      provider_id: input.providerId,
      provider_plan_id: input.providerPlanId,
      provider_price: input.providerPrice ?? null,
      provider_currency: input.providerCurrency ?? null,
      provider_priority: input.providerPriority ?? 100,
      margin: input.margin ?? 0,
      enabled: input.enabled ?? true,
      last_verified_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbEnqueuePlanReview(input: {
  providerId: string
  providerPlanId: string
  normalizedHash: string
  confidenceScore: number
  rawJson: unknown
}) {
  const res = await supabaseRest('plan_review_queue?on_conflict=provider_id,provider_plan_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      provider_id: input.providerId,
      provider_plan_id: input.providerPlanId,
      normalized_hash: input.normalizedHash,
      confidence_score: input.confidenceScore,
      status: 'pending',
      raw_json: input.rawJson,
    }),
  })
  if (!res.ok) throw new Error(await res.text())
}

export async function dbPatchProvider(providerId: string, patch: Record<string, unknown>) {
  const res = await supabaseRest(`lcr_providers?id=eq.${enc(providerId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as any[]
  return rows?.[0] ?? null
}


