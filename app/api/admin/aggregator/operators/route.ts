import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { aggListRawOperators, aggListSystemOperators, aggListProviders } from '@/lib/aggregator/repository'
import {
  buildCountryLookupByIso3,
  resolveSystemOperatorProviderIds,
} from '@/lib/admin/enrich-system-operator-providers'
import { loadProviderIdsBySystemOperatorFromPlans } from '@/lib/admin/load-system-operator-plan-providers'
import { matchesOperatorListSearch } from '@/lib/admin/operator-list-search'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ rawOperators: [], systemOperators: [], providers: [], configured: false })
  }

  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') ?? '5000')
  const offset = Number(searchParams.get('offset') ?? '0')
  const country = (searchParams.get('country') ?? '').trim().toUpperCase()
  const providerId = (searchParams.get('providerId') ?? '').trim()
  const q = (searchParams.get('q') ?? '').trim()
  const status = (searchParams.get('status') ?? '').trim().toUpperCase()
  const confidenceLevel = (searchParams.get('confidenceLevel') ?? '').trim().toUpperCase()
  const serviceDomain = (searchParams.get('serviceDomain') ?? searchParams.get('operatorDomain') ?? 'MOBILE').trim().toUpperCase()
  const includeAllDomains = searchParams.has('includeAllDomains') ? searchParams.get('includeAllDomains') === 'true' : true

  const listParams = {
    limit: Number.isFinite(limit) ? limit : 5000,
    offset: Number.isFinite(offset) ? offset : 0,
    country: country || undefined,
    status: status || undefined,
    confidenceLevel: confidenceLevel || undefined,
    includeAllStatus: true as const,
    ...(includeAllDomains
      ? {}
      : serviceDomain === 'MOBILE'
        ? { mobileCatalogOnly: true as const }
        : { serviceDomain }),
  }

  const [rawOperators, systemOperators, providers, mappingsRes, countriesRes, planProviderMap] = await Promise.all([
    aggListRawOperators({
      limit: Number.isFinite(limit) ? limit : 5000,
      offset: Number.isFinite(offset) ? offset : 0,
      country: country || undefined,
      providerId: providerId || undefined,
    }),
    aggListSystemOperators(listParams),
    aggListProviders().catch(() => []),
    supabaseRest('operator_mappings?select=system_operator_id,service_provider_id&limit=10000', { cache: 'no-store' }).catch(
      () => null as Response | null,
    ),
    supabaseRest('countries?select=id,name,iso2,iso3&limit=500', { cache: 'no-store' }).catch(
      () => null as Response | null,
    ),
    loadProviderIdsBySystemOperatorFromPlans(),
  ])

  const providerMap = new Map(providers.map((p: any) => [p.id, p]))

  const enrichedRawOperators = rawOperators.map((op: any) => {
    const provider = providerMap.get(op.service_provider_id)
    return {
      ...op,
      provider_name: provider?.name ?? 'Unknown Provider',
      provider_code: provider?.code ?? '',
    }
  })

  const countries = countriesRes?.ok ? ((await countriesRes.json()) as any[]) : []
  const countryLookup = buildCountryLookupByIso3(countries)

  const systemOperatorMappings = new Map<string, Set<string>>()
  if (mappingsRes?.ok) {
    const mappings = (await mappingsRes.json()) as { system_operator_id: string; service_provider_id: string }[]
    for (const m of mappings) {
      if (!systemOperatorMappings.has(m.system_operator_id)) {
        systemOperatorMappings.set(m.system_operator_id, new Set())
      }
      systemOperatorMappings.get(m.system_operator_id)?.add(m.service_provider_id)
    }
  }

  let enrichedSystemOperators = systemOperators.map((op: any) => {
    const mappedIds = Array.from(systemOperatorMappings.get(op.id) ?? [])
    const providerIds = resolveSystemOperatorProviderIds(
      {
        id: String(op.id),
        system_operator_name: String(op.system_operator_name ?? ''),
        country_id: String(op.country_id ?? ''),
      },
      mappedIds,
      rawOperators,
      countryLookup,
      planProviderMap.get(String(op.id)) ?? [],
    )
    const providerNames = providerIds.map((pid) => providerMap.get(pid)?.name ?? 'Unknown Provider')
    const providerCodes = providerIds.map((pid) => providerMap.get(pid)?.code ?? '').filter(Boolean)
    return {
      ...op,
      mappedProviderIds: providerIds,
      mappedProviderNames: providerNames,
      mappedProviderCodes: providerCodes,
    }
  })

  if (providerId) {
    enrichedSystemOperators = enrichedSystemOperators.filter((op) =>
      (op.mappedProviderIds as string[]).includes(providerId),
    )
  }

  if (q) {
    enrichedSystemOperators = enrichedSystemOperators.filter((op) =>
      matchesOperatorListSearch(q, {
        operatorName: op.system_operator_name,
        slug: op.slug,
        operatorId: op.id,
        providerNames: op.mappedProviderNames,
        providerCodes: op.mappedProviderCodes,
      }),
    )
  }

  let filteredRawOperators = enrichedRawOperators
  if (providerId) {
    filteredRawOperators = filteredRawOperators.filter((op) => op.service_provider_id === providerId)
  }
  if (q) {
    filteredRawOperators = filteredRawOperators.filter((op) =>
      matchesOperatorListSearch(q, {
        operatorName: op.provider_operator_name,
        operatorId: op.id,
        providerOperatorId: op.provider_operator_id,
        providerNames: [op.provider_name],
        providerCodes: [op.provider_code],
      }),
    )
  }

  return NextResponse.json({
    configured: true,
    rawOperators: filteredRawOperators,
    systemOperators: enrichedSystemOperators,
    providers,
  })
}
