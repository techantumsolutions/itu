import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { aggListRawOperators, aggListSystemOperators, aggListProviders } from '@/lib/aggregator/repository'

// getNormalizedBaseName has been moved to lib/aggregator/repository.ts

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
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
  const confidenceLevel = (searchParams.get('confidenceLevel') ?? '').trim().toUpperCase()
  const serviceDomain = (searchParams.get('serviceDomain') ?? searchParams.get('operatorDomain') ?? 'MOBILE').trim().toUpperCase()
  const includeAllDomains = searchParams.has('includeAllDomains') ? searchParams.get('includeAllDomains') === 'true' : true

  const listParams = {
    limit: Number.isFinite(limit) ? limit : 5000,
    offset: Number.isFinite(offset) ? offset : 0,
    country: country || undefined,
    q: q || undefined,
    status: status || undefined,
    confidenceLevel: confidenceLevel || undefined,
    includeAllStatus: true as const,
    ...(includeAllDomains
      ? {}
      : serviceDomain === 'MOBILE'
        ? { mobileCatalogOnly: true as const }
        : { serviceDomain }),
  }

  const [rawOperators, systemOperators, providers, mappingsRes, countriesRes] = await Promise.all([
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
  ])

  const providerMap = new Map(providers.map((p: any) => [p.id, p]))

  // Enrich rawOperators with provider name
  const enrichedRawOperators = rawOperators.map((op: any) => ({
    ...op,
    provider_name: providerMap.get(op.service_provider_id)?.name ?? 'Unknown Provider',
  }))

  const countries = countriesRes?.ok ? (await countriesRes.json() as any[]) : []
  const countryMap = new Map(countries.map(c => [c.id.toUpperCase(), c]))

  const finalSystemOperators = systemOperators
  const finalMappingsRes = mappingsRes

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
