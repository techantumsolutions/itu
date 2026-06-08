import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { aggListRawOperators, aggListSystemOperators, aggListProviders, aggMergeSystemOperators } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'

function getNormalizedBaseName(name: string, countryName: string, iso2: string, iso3: string): string {
  let normalized = name.toLowerCase();

  // Remove full country name
  if (countryName) {
    const escapedCountryName = countryName.toLowerCase().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    normalized = normalized.replace(new RegExp(`\\b${escapedCountryName}\\b`, 'gi'), '');
    
    // Clean country name to get base name (e.g. "Republic of The Gambia" -> "gambia")
    let cleaned = countryName.toLowerCase();
    if (cleaned.includes('united kingdom')) {
      cleaned = 'united kingdom';
    } else if (cleaned.includes('united states')) {
      cleaned = 'united states';
    } else if (cleaned.includes('russian federation') || cleaned.includes('russia')) {
      cleaned = 'russia';
    } else {
      cleaned = cleaned
        .replace(/\b(republic of|republic|the|independent state of|state of|kingdom of|union of|democratic republic of|federative republic of|islamic republic of|people's democratic republic of|sultanate of|cooperative republic of|pluralistic state of|principality of|grand duchy of|commonwealth of|socialist state of|federation)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
      
    if (cleaned && cleaned !== countryName.toLowerCase()) {
      const escapedCleaned = cleaned.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      normalized = normalized.replace(new RegExp(`\\b${escapedCleaned}\\b`, 'gi'), '');
    }
  }

  // Remove iso3 code
  if (iso3) {
    normalized = normalized.replace(new RegExp(`\\b${iso3.toLowerCase()}\\b`, 'gi'), '');
  }

  // Remove iso2 code
  if (iso2) {
    normalized = normalized.replace(new RegExp(`\\b${iso2.toLowerCase()}\\b`, 'gi'), '');
  }

  // Custom aliases for specific countries
  if (iso3 === 'ARE') {
    normalized = normalized.replace(/\buae\b/gi, '');
  }
  if (iso3 === 'GBR') {
    normalized = normalized.replace(/\buk\b/gi, '');
  }

  // Remove common generic prefixes/suffixes and plan details from operator names
  normalized = normalized.replace(/\b(topup|top-up|prepaid|postpaid|data|bundle|bundles|internet|telecom|mobile|plan|plans|recharge|refill|load|airtime|credit|minutes|minute|min|days|day|gb|mb|kb|tb)\b/gi, '');

  // Remove currency codes (3-letter codes)
  normalized = normalized.replace(/\b(dzd|gmd|usd|eur|inr|egp|yer|sar|qar|omr|kwd|bhd|mad|jod|lyd|sdg|tnd|iqd|aed|gbp|cad|aud|cny|jpy|rub|try|brl|mxn|php|pkb|lkr|npr|bra|cop|zar|efy|idr|myr|sgd|thb|vnd|xaf|xof|rwf|mga|mwk|szl|lsl|nad|bwp|szl|mur|scr|kmf|djf|sos|etb|ssp|sdg|ern)\b/gi, '');

  // Remove digit patterns (e.g. 400, 2000, 10gb, 3gb)
  normalized = normalized.replace(/\b\d+(gb|mb|kb|min|days|day|d)?\b/gi, '');

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Telecom Alias Consolidation (Rule 7)
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (compact === 'reliancejio' || compact === 'jioindia' || compact === 'jio') {
    return 'jio';
  }
  if (compact === 'vodafoneidea' || compact === 'vi' || compact === 'vodafoneideaindia') {
    return 'vi';
  }
  if (compact === 'vodafoneindia' || compact === 'vodafone') {
    return 'vodafone';
  }
  if (compact === 'bsnlindia' || compact === 'bsnl') {
    return 'bsnl';
  }
  if (compact === 'airtelindia' || compact === 'airtel') {
    return 'airtel';
  }
  if (compact === 'mtnlindia' || compact === 'mtnl') {
    return 'mtnl';
  }

  return normalized;
}

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) return NextResponse.json({ rawOperators: [], systemOperators: [], providers: [], configured: false })

  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') ?? '5000')
  const offset = Number(searchParams.get('offset') ?? '0')
  const country = (searchParams.get('country') ?? '').trim().toUpperCase()
  const providerId = (searchParams.get('providerId') ?? '').trim()
  const q = (searchParams.get('q') ?? '').trim()
  const status = (searchParams.get('status') ?? '').trim().toUpperCase()
  const operatorDomain = (searchParams.get('operatorDomain') ?? 'MOBILE').trim().toUpperCase()
  const includeAllDomains = searchParams.get('includeAllDomains') === 'true'

  const [rawOperators, systemOperators, providers, mappingsRes, countriesRes] = await Promise.all([
    aggListRawOperators({
      limit: Number.isFinite(limit) ? limit : 5000,
      offset: Number.isFinite(offset) ? offset : 0,
      country: country || undefined,
      providerId: providerId || undefined,
    }),
    aggListSystemOperators({
      limit: Number.isFinite(limit) ? limit : 5000,
      offset: Number.isFinite(offset) ? offset : 0,
      country: country || undefined,
      q: q || undefined,
      status: status || undefined,
      includeAllStatus: true,
      operatorDomain: includeAllDomains ? undefined : operatorDomain || 'MOBILE',
      mobileCatalogOnly: !includeAllDomains && !operatorDomain ? true : undefined,
    }),
    aggListProviders().catch(() => []),
    supabaseRest('operator_mappings?select=system_operator_id,service_provider_id&limit=10000', { cache: 'no-store' }).catch(
      () => null as Response | null,
    ),
    supabaseRest('countries?select=id,name,iso2,iso3&limit=500', { cache: 'no-store' }).catch(
      () => null as Response | null,
    ),
  ])

  const providerMap = new Map(providers.map((p: any) => [p.id, p]))

  // Enrich rawOperators with provider name
  const enrichedRawOperators = rawOperators.map((op: any) => ({
    ...op,
    provider_name: providerMap.get(op.service_provider_id)?.name ?? 'Unknown Provider',
  }))

  const countries = countriesRes?.ok ? (await countriesRes.json() as any[]) : []
  const countryMap = new Map(countries.map(c => [c.id.toUpperCase(), c]))

  // Auto-merge duplicate system operators
  let mergedAny = false
  const groups = new Map<string, any[]>()

  for (const op of systemOperators) {
    const countryData = countryMap.get(op.country_id.toUpperCase())
    if (!countryData) continue

    const normalized = getNormalizedBaseName(op.system_operator_name, countryData.name, countryData.iso2, countryData.iso3)
    if (!normalized) continue

    const key = `${op.country_id.toUpperCase()}:${normalized}`
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)?.push(op)
  }

  for (const [key, ops] of groups.entries()) {
    if (ops.length >= 2) {
      // Sort by system_operator_name length ascending so the shortest name is the target
      ops.sort((a, b) => a.system_operator_name.length - b.system_operator_name.length)
      const target = ops[0]
      const sources = ops.slice(1)

      try {
        console.log(`[Auto-Merge] Merging duplicate operators for group ${key}: target is '${target.system_operator_name}' (${target.id}), sources are:`, sources.map(s => `'${s.system_operator_name}' (${s.id})`))
        const actor = getRequestUser(request)
        await aggMergeSystemOperators(target.id, sources.map(s => s.id), actor?.email ?? 'system-automerge')
        mergedAny = true
      } catch (err) {
        console.error(`[Auto-Merge] Failed to merge group ${key}:`, err)
      }
    }
  }

  let finalSystemOperators = systemOperators
  let finalMappingsRes = mappingsRes

  if (mergedAny) {
    // Re-fetch system operators and mappings so returned data is updated
    const [reFetchedSystemOps, reFetchedMappings] = await Promise.all([
      aggListSystemOperators({
        limit: Number.isFinite(limit) ? limit : 5000,
        offset: Number.isFinite(offset) ? offset : 0,
        country: country || undefined,
        q: q || undefined,
        status: status || undefined,
        includeAllStatus: true,
      }),
      supabaseRest('operator_mappings?select=system_operator_id,service_provider_id&limit=10000', { cache: 'no-store' }).catch(
        () => null as Response | null,
      ),
    ])
    finalSystemOperators = reFetchedSystemOps
    finalMappingsRes = reFetchedMappings
  }

  const systemOperatorMappings = new Map<string, Set<string>>()
  if (finalMappingsRes?.ok) {
    const mappings = (await finalMappingsRes.json()) as { system_operator_id: string; service_provider_id: string }[]
    for (const m of mappings) {
      if (!systemOperatorMappings.has(m.system_operator_id)) {
        systemOperatorMappings.set(m.system_operator_id, new Set())
      }
      systemOperatorMappings.get(m.system_operator_id)?.add(m.service_provider_id)
    }
  }

  // Enrich systemOperators with mapped provider IDs and names
  const enrichedSystemOperators = finalSystemOperators.map((op: any) => {
    const providerIds = Array.from(systemOperatorMappings.get(op.id) ?? [])
    const providerNames = providerIds.map(pid => providerMap.get(pid)?.name ?? 'Unknown Provider')
    return {
      ...op,
      mappedProviderIds: providerIds,
      mappedProviderNames: providerNames,
    }
  })

  return NextResponse.json({
    configured: true,
    rawOperators: enrichedRawOperators,
    systemOperators: enrichedSystemOperators,
    providers,
  })
}
