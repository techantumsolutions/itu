import { supabaseRest } from '@/lib/db/supabase-rest'
import { OperatorTrustEngine } from '@/lib/aggregator/catalog-intelligence/trust-engine'
import {
  resolveCountryIso3FromCountryId,
  upsertOperatorMergeHistory,
} from '@/lib/aggregator/operator-merge-history/repository'
import { buildSystemOperatorInput } from '@/lib/aggregator/operator-normalizer'
import { slugify } from '@/lib/aggregator/signature'

function enc(value: string): string {
  return encodeURIComponent(value)
}

async function loadProviderOperatorNames(systemOperatorId: string): Promise<string[]> {
  const names = new Set<string>()
  const mapRes = await supabaseRest(
    `operator_mappings?system_operator_id=eq.${enc(systemOperatorId)}&select=provider_operator_raw_id,provider_operator_id&limit=500`,
    { cache: 'no-store' },
  ).catch(() => null)
  if (!mapRes?.ok) return []

  const mappings = (await mapRes.json().catch(() => [])) as Array<{
    provider_operator_raw_id?: string | null
    provider_operator_id?: string | null
  }>

  const rawIds = [
    ...new Set(
      mappings.map((row) => row.provider_operator_raw_id).filter((id): id is string => Boolean(id)),
    ),
  ]

  for (let i = 0; i < rawIds.length; i += 100) {
    const chunk = rawIds.slice(i, i + 100)
    const rawRes = await supabaseRest(
      `provider_operator_raw?id=in.(${chunk.map(enc).join(',')})&select=provider_operator_name&limit=${chunk.length}`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (!rawRes?.ok) continue
    const rows = (await rawRes.json().catch(() => [])) as Array<{ provider_operator_name?: string | null }>
    for (const row of rows) {
      const name = row.provider_operator_name?.trim()
      if (name) names.add(name)
    }
  }

  return [...names]
}

/** Record aliases + merge history so sync keeps using the same system operator after admin rename. */
export async function recordAdminOperatorRename(input: {
  systemOperatorId: string
  oldName: string
  newName: string
  countryId: string
  actorEmail?: string | null
}): Promise<void> {
  const oldName = input.oldName.trim()
  const newName = input.newName.trim()
  const countryId = input.countryId.trim()
  if (!oldName || !newName || oldName === newName) return

  const aliasCountry = countryId || '*'

  await OperatorTrustEngine.learnFromAliasMapping(
    input.systemOperatorId,
    oldName,
    aliasCountry,
    'ADMIN_RENAME',
  ).catch(() => {})

  const providerNames = await loadProviderOperatorNames(input.systemOperatorId)
  for (const providerName of providerNames) {
    if (providerName === newName) continue
    await OperatorTrustEngine.learnFromAliasMapping(
      input.systemOperatorId,
      providerName,
      aliasCountry,
      'ADMIN_RENAME',
    ).catch(() => {})
  }

  const canonicalFromOld = buildSystemOperatorInput(
    { countryIso3: countryId, operatorName: oldName } as Parameters<typeof buildSystemOperatorInput>[0],
    oldName,
  )
  if (canonicalFromOld?.systemOperatorName && canonicalFromOld.systemOperatorName !== newName) {
    await OperatorTrustEngine.learnFromAliasMapping(
      input.systemOperatorId,
      canonicalFromOld.systemOperatorName,
      aliasCountry,
      'ADMIN_RENAME',
    ).catch(() => {})
  }

  const countryIso3 = (await resolveCountryIso3FromCountryId(countryId)) ?? countryId.toUpperCase()
  const namesForHistory = new Set<string>([oldName, ...providerNames])
  if (canonicalFromOld?.systemOperatorName) namesForHistory.add(canonicalFromOld.systemOperatorName)

  for (const sourceName of namesForHistory) {
    if (!sourceName || sourceName === newName) continue
    await upsertOperatorMergeHistory({
      countryIso3,
      sourceOperatorName: sourceName,
      targetOperatorName: newName,
      mergeReason: 'ADMIN_RENAME',
      mergedByAdmin: input.actorEmail ?? 'admin',
      isActive: true,
    }).catch(() => {})
  }
}

/** Stable slug used for provider sync upserts after an admin rename. */
export function stableOperatorSlugForRename(oldName: string, currentSlug?: string | null): string {
  const fromOld = slugify(oldName.trim())
  if (fromOld && fromOld !== 'item') return fromOld
  const fromCurrent = (currentSlug ?? '').trim()
  if (fromCurrent) return fromCurrent
  return slugify(oldName.trim() || 'operator')
}
