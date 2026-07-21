/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { loadCatalogIntelligenceCache } from '../catalog-intelligence/brand-intelligence'
import type { OperatorDomain } from '@/lib/aggregator/catalog-intelligence/types'
import { aggListProviders } from './providers'
import { enc, jsonRowsOrEmpty, parseOperatorDomain } from './shared'
import type { SystemPlanProviderLabels } from './types'

export async function aggFindSystemPlanCandidates(input: {
  systemOperatorId: string
  amount?: number | null
  currency?: string | null
  limit?: number
}) {
  const filters = [
    `system_operator_id=eq.${enc(input.systemOperatorId)}`,
    'status=eq.ACTIVE',
    `limit=${input.limit ?? 10}`,
    'select=id,normalized_signature,amount,currency,validity,data_volume,sms,talktime,plan_type,system_plan_name',
  ]
  if (input.amount != null) filters.push(`amount=eq.${input.amount}`)
  if (input.currency) filters.push(`currency=eq.${enc(input.currency)}`)
  const res = await supabaseRest(`system_plans?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggCountProvidersBySystemPlanIds(
  systemPlanIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (!systemPlanIds.length) return counts

  const uniqueIds = [...new Set(systemPlanIds)]
  const providerSets = new Map<string, Set<string>>()

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100)
    const res = await supabaseRest(
      `plan_mappings?system_plan_id=in.(${chunk.map((id) => encodeURIComponent(id)).join(',')})&select=system_plan_id,service_provider_id&limit=10000`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (!res?.ok) continue

    const rows = (await res.json()) as Array<{
      system_plan_id?: string
      service_provider_id?: string
    }>
    for (const row of rows) {
      const planId = row.system_plan_id
      const providerId = row.service_provider_id
      if (!planId || !providerId) continue
      if (!providerSets.has(planId)) providerSets.set(planId, new Set())
      providerSets.get(planId)!.add(providerId)
    }
  }

  for (const [planId, providers] of providerSets.entries()) {
    counts.set(planId, providers.size)
  }
  return counts
}

export async function aggProviderLabelsBySystemPlanIds(
  systemPlanIds: string[],
): Promise<Map<string, SystemPlanProviderLabels>> {
  const labelsByPlan = new Map<string, SystemPlanProviderLabels>()
  if (!systemPlanIds.length) return labelsByPlan

  const uniqueIds = [...new Set(systemPlanIds)]
  const providerSets = new Map<string, Set<string>>()

  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100)
    const res = await supabaseRest(
      `plan_mappings?system_plan_id=in.(${chunk.map((id) => encodeURIComponent(id)).join(',')})&select=system_plan_id,service_provider_id&limit=10000`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (!res?.ok) continue

    const rows = (await res.json()) as Array<{
      system_plan_id?: string
      service_provider_id?: string
    }>
    for (const row of rows) {
      const planId = row.system_plan_id
      const providerId = row.service_provider_id
      if (!planId || !providerId) continue
      if (!providerSets.has(planId)) providerSets.set(planId, new Set())
      providerSets.get(planId)!.add(providerId)
    }
  }

  if (!providerSets.size) return labelsByPlan

  const providers = await aggListProviders().catch(() => [])
  const providerMetaById = new Map(
    providers.map((p) => [
      p.id,
      {
        name: (p.name || p.code || 'Unknown Provider').trim(),
        code: (p.code || '').trim(),
      },
    ]),
  )

  for (const [planId, providerIds] of providerSets.entries()) {
    const names: string[] = []
    const codes: string[] = []
    for (const id of providerIds) {
      const meta = providerMetaById.get(id)
      if (!meta) continue
      if (meta.name) names.push(meta.name)
      if (meta.code) codes.push(meta.code)
    }
    names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    codes.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    labelsByPlan.set(planId, { names, codes })
  }

  return labelsByPlan
}

export async function aggProviderNamesBySystemPlanIds(
  systemPlanIds: string[],
): Promise<Map<string, string[]>> {
  const labels = await aggProviderLabelsBySystemPlanIds(systemPlanIds)
  return new Map([...labels.entries()].map(([planId, value]) => [planId, value.names]))
}

export async function aggListRawOperators(params: {
  limit?: number
  offset?: number
  country?: string
  providerId?: string
  q?: string
}) {
  const targetLimit = params.limit ?? 50
  const startOffset = params.offset ?? 0

  const allRows: any[] = []
  let currentOffset = startOffset
  let remaining = targetLimit

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining, 1000)
    const q = [
      'select=*',
      `limit=${fetchLimit}`,
      `offset=${currentOffset}`,
      'order=fetched_at.desc',
    ]
    if (params.country) q.push(`iso_code=eq.${enc(params.country)}`)
    if (params.providerId) q.push(`service_provider_id=eq.${enc(params.providerId)}`)
    const needle = params.q?.trim()
    if (needle) {
      const encoded = enc(needle)
      q.push(`or=(provider_operator_name.ilike.*${encoded}*,provider_operator_id.ilike.*${encoded}*)`)
    }
    const res = await supabaseRest(`provider_operator_raw?${q.join('&')}`, { cache: 'no-store' })
    const rows = await jsonRowsOrEmpty(res)

    if (!rows.length) break
    allRows.push(...rows)
    if (rows.length < fetchLimit) break

    currentOffset += rows.length
    remaining -= rows.length
  }
  return allRows
}

export async function aggListRawPlans(params: { limit?: number; offset?: number; providerId?: string; operatorRawId?: string }) {
  const q = [
    'select=*',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=fetched_at.desc',
  ]
  if (params.providerId) q.push(`provider_id=eq.${enc(params.providerId)}`)
  if (params.operatorRawId) q.push(`provider_operator_raw_id=eq.${enc(params.operatorRawId)}`)
  const res = await supabaseRest(`provider_plans_raw?${q.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggListSystemOperators(params: {
  country?: string
  q?: string
  limit?: number
  offset?: number
  status?: string
  includeAllStatus?: boolean
  operatorDomain?: string
  serviceDomain?: string
  mobileCatalogOnly?: boolean
  confidenceLevel?: string
}) {
  const targetLimit = params.limit ?? 50
  const startOffset = params.offset ?? 0

  const allRows: any[] = []
  let currentOffset = startOffset
  let remaining = targetLimit

  while (remaining > 0) {
    const fetchLimit = Math.min(remaining, 1000)
    const filters = [
      'select=*',
    ]
    if (params.includeAllStatus) {
      if (params.status) {
        filters.push(`status=eq.${enc(params.status)}`)
      }
    } else {
      filters.push(params.status ? `status=eq.${enc(params.status)}` : 'status=eq.ACTIVE')
    }

    filters.push(
      `limit=${fetchLimit}`,
      `offset=${currentOffset}`,
      'order=system_operator_name.asc',
    )
    if (params.country) filters.push(`country_id=eq.${enc(params.country)}`)
    if (params.confidenceLevel) filters.push(`confidence_level=eq.${enc(params.confidenceLevel)}`)
    if (params.q) filters.push(`system_operator_name=ilike.*${enc(params.q)}*`)
    if (params.serviceDomain) {
      filters.push(`service_domain=eq.${enc(params.serviceDomain)}`)
    } else if (params.mobileCatalogOnly) {
      filters.push('or=(service_domain.eq.MOBILE,service_domain.is.null)')
    } else if (params.operatorDomain) {
      filters.push(`operator_domain=eq.${enc(params.operatorDomain)}`)
    }
    const res = await supabaseRest(`system_operators?${filters.join('&')}`, { cache: 'no-store' })
    const rows = await jsonRowsOrEmpty(res)

    if (!rows.length) break
    allRows.push(...rows)
    if (rows.length < fetchLimit) break

    currentOffset += rows.length
    remaining -= rows.length
  }
  return allRows
}

export async function aggListSystemPlans(params: {
  systemOperatorId?: string
  q?: string
  limit?: number
  offset?: number
  mobileCatalogOnly?: boolean
  serviceDomain?: string
  confidenceLevel?: string
}) {
  const filters = [
    'select=*',
    'status=eq.ACTIVE',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=amount.asc',
  ]
  if (params.mobileCatalogOnly) {
    filters.push('or=(service_domain.eq.MOBILE,service_domain.is.null)')
  } else if (params.serviceDomain) {
    filters.push(`service_domain=eq.${enc(params.serviceDomain)}`)
  }
  if (params.systemOperatorId) filters.push(`system_operator_id=eq.${enc(params.systemOperatorId)}`)
  if (params.confidenceLevel) filters.push(`confidence_level=eq.${enc(params.confidenceLevel)}`)
  if (params.q) filters.push(`system_plan_name=ilike.*${enc(params.q)}*`)
  const res = await supabaseRest(`system_plans?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggListDuplicateSuggestions(params: { status?: string; limit?: number; offset?: number }) {
  const filters = [
    'select=*',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=match_score.desc',
  ]
  if (params.status) filters.push(`status=eq.${enc(params.status)}`)
  const res = await supabaseRest(`duplicate_plan_suggestions?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggListSyncLogs(params: { providerId?: string; limit?: number; offset?: number }) {
  const filters = [
    'select=*',
    `limit=${params.limit ?? 50}`,
    `offset=${params.offset ?? 0}`,
    'order=created_at.desc',
  ]
  if (params.providerId) filters.push(`service_provider_id=eq.${enc(params.providerId)}`)
  const res = await supabaseRest(`sync_logs?${filters.join('&')}`, { cache: 'no-store' })
  return jsonRowsOrEmpty(res)
}

export async function aggResolveInternalPlanIdForSystemPlan(systemPlanId: string): Promise<string | null> {
  const res = await supabaseRest(`system_plans?id=eq.${enc(systemPlanId)}&select=internal_plan_id&limit=1`, { cache: 'no-store' })
  const rows = await jsonRowsOrEmpty<{ internal_plan_id: string | null }>(res)
  return rows[0]?.internal_plan_id ?? null
}

export async function aggLoadTrustedOperators(): Promise<
  Array<{
    normalizedName: string
    displayName: string
    countryCode: string
    trustLevel: string
    isVerifiedTelecom: boolean
    trustScore?: number
    canonicalOperatorId?: string | null
    source?: string
  }>
> {
  const [registryRes, aliasesRes] = await Promise.all([
    supabaseRest('operator_trust_registry?or=(is_verified.eq.true,trust_score.gte.70)&select=*', { cache: 'no-store' }),
    supabaseRest('operator_aliases?confidence_score.gte.70&select=*', { cache: 'no-store' })
  ]).catch(() => [null, null])

  const pool: any[] = []
  
  if (registryRes?.ok) {
    const rows = await registryRes.json() as any[]
    for (const r of rows) {
      pool.push({
        normalizedName: r.normalized_name,
        displayName: r.display_name || r.normalized_name,
        countryCode: r.country_code || '*',
        trustLevel: r.trust_level || (r.trust_score >= 90 ? 'VERIFIED' : 'TRUSTED'),
        isVerifiedTelecom: r.is_verified || r.trust_score >= 90,
        trustScore: Number(r.trust_score || 0),
        canonicalOperatorId: r.canonical_operator_id,
        source: r.source || 'TRUST_REGISTRY'
      })
    }
  }

  if (aliasesRes?.ok) {
    const rows = await aliasesRes.json() as any[]
    for (const r of rows) {
      pool.push({
        normalizedName: r.normalized_alias || r.alias_name.toUpperCase(),
        displayName: r.alias_name,
        countryCode: r.country_code || '*',
        trustLevel: r.confidence_score >= 90 ? 'VERIFIED' : 'TRUSTED',
        isVerifiedTelecom: r.confidence_score >= 70,
        trustScore: Number(r.confidence_score || 0),
        canonicalOperatorId: r.canonical_operator_id,
        source: 'ALIAS_MATCH'
      })
    }
  }

  return pool
}

export async function aggLoadOperatorDomainRegistry(): Promise<
  import('@/lib/aggregator/catalog-intelligence/types').OperatorDomainRegistryMatch[]
> {
  const res = await supabaseRest(
    'operator_domain_registry?is_verified=eq.true&select=operator_name,normalized_name,operator_domain,confidence,country_iso3',
    { cache: 'no-store' },
  ).catch(() => null)
  if (!res?.ok) return []
  const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    normalizedName: String(row.normalized_name ?? ''),
    operatorName: String(row.operator_name ?? row.normalized_name ?? ''),
    operatorDomain: parseOperatorDomain(String(row.operator_domain ?? 'UNKNOWN')),
    confidence: Number(row.confidence ?? 90),
    countryIso3: row.country_iso3 ? String(row.country_iso3) : null,
  }))
}

export async function aggLoadNonTelecomOperatorRegistry(): Promise<
  import('@/lib/aggregator/catalog-intelligence/types').NonTelecomOperatorMatch[]
> {
  const res = await supabaseRest(
    'non_telecom_operator_registry?is_verified=eq.true&select=operator_name,normalized_name,operator_domain,confidence',
    { cache: 'no-store' },
  ).catch(() => null)
  if (!res?.ok) return []
  const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    normalizedName: String(row.normalized_name ?? ''),
    operatorName: String(row.operator_name ?? row.normalized_name ?? ''),
    operatorDomain: parseOperatorDomain(String(row.operator_domain ?? 'RETAIL')),
    confidence: Number(row.confidence ?? 95),
  }))
}

export async function aggLoadCatalogIntelligenceRegistries() {
  await loadCatalogIntelligenceCache().catch(err => {
    console.error(`[Cache] Failed to load catalog intelligence cache:`, err)
  })

  const [trustedOperators, domainRegistry, nonTelecomRegistry] = await Promise.all([
    aggLoadTrustedOperators(),
    aggLoadOperatorDomainRegistry(),
    aggLoadNonTelecomOperatorRegistry(),
  ])
  return { trustedOperators, domainRegistry, nonTelecomRegistry }
}
