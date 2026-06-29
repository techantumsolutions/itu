import { supabaseRest } from '@/lib/db/supabase-rest'
import { createOperatorMergeHistoryMatcher } from '@/lib/aggregator/operator-merge-history'
import { buildSystemOperatorInput } from '@/lib/aggregator/operator-normalizer'
import { slugify } from '@/lib/aggregator/signature'

function enc(value: string): string {
  return encodeURIComponent(value)
}

async function lookupByAlias(aliasName: string): Promise<string | null> {
  const normName = aliasName.trim().toUpperCase()
  if (!normName) return null

  const queries = [
    `operator_aliases?alias_name=eq.${enc(normName)}&select=canonical_operator_id,system_operator_id&limit=1`,
    `operator_aliases?alias_name=eq.${enc(aliasName.trim())}&select=canonical_operator_id,system_operator_id&limit=1`,
  ]

  for (const path of queries) {
    const res = await supabaseRest(path, { cache: 'no-store' }).catch(() => null)
    if (!res?.ok) continue
    const rows = (await res.json().catch(() => [])) as Array<{
      canonical_operator_id?: string | null
      system_operator_id?: string | null
    }>
    const id = rows[0]?.canonical_operator_id ?? rows[0]?.system_operator_id
    if (id) return String(id)
  }
  return null
}

async function lookupByProviderMapping(input: {
  serviceProviderId?: string
  providerOperatorId?: string
  providerOperatorRawId?: string
}): Promise<string | null> {
  if (input.serviceProviderId && input.providerOperatorId) {
    const res = await supabaseRest(
      `operator_mappings?service_provider_id=eq.${enc(input.serviceProviderId)}&provider_operator_id=eq.${enc(input.providerOperatorId)}&select=system_operator_id&limit=1`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (res?.ok) {
      const rows = (await res.json().catch(() => [])) as Array<{ system_operator_id?: string }>
      if (rows[0]?.system_operator_id) return String(rows[0].system_operator_id)
    }
  }

  if (input.serviceProviderId && input.providerOperatorRawId) {
    const res = await supabaseRest(
      `operator_mappings?service_provider_id=eq.${enc(input.serviceProviderId)}&provider_operator_raw_id=eq.${enc(input.providerOperatorRawId)}&select=system_operator_id&limit=1`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (res?.ok) {
      const rows = (await res.json().catch(() => [])) as Array<{ system_operator_id?: string }>
      if (rows[0]?.system_operator_id) return String(rows[0].system_operator_id)
    }
  }

  return null
}

async function lookupByMergeHistory(operatorName: string, countryIso3: string): Promise<string | null> {
  const country = countryIso3.trim().toUpperCase()
  const name = operatorName.trim()
  if (!country || !name) return null

  const matcher = await createOperatorMergeHistoryMatcher(country)
  const match = matcher.match(name, country)
  if (!match) return null

  const targetName = match.row.targetOperatorName.trim()
  if (!targetName) return null

  const byNameRes = await supabaseRest(
    `system_operators?country_id=eq.${enc(country)}&system_operator_name=eq.${enc(targetName)}&select=id&limit=1`,
    { cache: 'no-store' },
  ).catch(() => null)
  if (byNameRes?.ok) {
    const rows = (await byNameRes.json().catch(() => [])) as Array<{ id?: string }>
    if (rows[0]?.id) return String(rows[0].id)
  }

  const bySlugRes = await supabaseRest(
    `system_operators?country_id=eq.${enc(country)}&slug=eq.${enc(slugify(targetName))}&select=id&limit=1`,
    { cache: 'no-store' },
  ).catch(() => null)
  if (bySlugRes?.ok) {
    const rows = (await bySlugRes.json().catch(() => [])) as Array<{ id?: string }>
    if (rows[0]?.id) return String(rows[0].id)
  }

  return null
}

/** Resolve an existing system operator before creating a duplicate during sync. */
export async function resolveSystemOperatorIdForSync(input: {
  serviceProviderId: string
  providerOperatorId?: string
  providerOperatorRawId?: string
  providerOperatorName: string
  countryIso3: string
  telecomOperatorName?: string
}): Promise<string | null> {
  const countryIso3 = input.countryIso3.trim().toUpperCase()
  const providerOperatorName = input.providerOperatorName.trim()
  const telecomOperatorName = (input.telecomOperatorName ?? providerOperatorName).trim()

  const fromMapping = await lookupByProviderMapping({
    serviceProviderId: input.serviceProviderId,
    providerOperatorId: input.providerOperatorId,
    providerOperatorRawId: input.providerOperatorRawId,
  })
  if (fromMapping) return fromMapping

  for (const aliasName of [providerOperatorName, telecomOperatorName]) {
    const fromAlias = await lookupByAlias(aliasName)
    if (fromAlias) return fromAlias
  }

  for (const operatorName of [providerOperatorName, telecomOperatorName]) {
    const fromHistory = await lookupByMergeHistory(operatorName, countryIso3)
    if (fromHistory) return fromHistory
  }

  const canonical = buildSystemOperatorInput(
    { countryIso3, operatorName: telecomOperatorName } as Parameters<typeof buildSystemOperatorInput>[0],
    telecomOperatorName,
  )
  if (canonical?.systemOperatorName) {
    const fromCanonicalAlias = await lookupByAlias(canonical.systemOperatorName)
    if (fromCanonicalAlias) return fromCanonicalAlias
    const fromCanonicalHistory = await lookupByMergeHistory(canonical.systemOperatorName, countryIso3)
    if (fromCanonicalHistory) return fromCanonicalHistory
  }

  return null
}
