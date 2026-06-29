import { NextResponse } from 'next/server'
import { adminCanUseAnyFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggListRawPlans,
  aggListSystemPlans,
  isAggregatorSchemaReady,
  isMissingAggregatorSchemaError,
} from '@/lib/aggregator/repository'
import { convertServerPatchToFullTree } from 'next/dist/client/components/segment-cache/navigation'

export async function GET(request: Request) {
  if (!(await adminCanUseAnyFeature(request, ['integrations', 'products']))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!isSupabaseCatalogConfigured()) {
    return NextResponse.json({ rawPlans: [], systemPlans: [], configured: false, schemaReady: false })
  }

  const schemaReady = await isAggregatorSchemaReady()
  if (!schemaReady) {
    return NextResponse.json({
      configured: true,
      schemaReady: false,
      rawPlans: [],
      systemPlans: [],
      message: 'Apply supabase/multi_provider_aggregator_schema.sql to enable system plans and raw operator normalization.',
    })
  }

  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') ?? '50')
  const offset = Number(searchParams.get('offset') ?? '0')
  const providerId = (searchParams.get('providerId') ?? '').trim()
  const operatorRawId = (searchParams.get('operatorRawId') ?? '').trim()
  const systemOperatorId = (searchParams.get('systemOperatorId') ?? '').trim()
  const q = (searchParams.get('q') ?? '').trim()
  const confidenceLevel = (searchParams.get('confidenceLevel') ?? '').trim().toUpperCase()

  let rawPlans: any[] = []
  let systemPlans: any[] = []
  let mappingRes: Response | null = null
  try {
    ;[rawPlans, systemPlans, mappingRes] = await Promise.all([
      aggListRawPlans({
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
        providerId: providerId || undefined,
        operatorRawId: operatorRawId || undefined,
      }),
      aggListSystemPlans({
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
        systemOperatorId: systemOperatorId || undefined,
        q: q || undefined,
        confidenceLevel: confidenceLevel || undefined,
      }),

      supabaseRest('plan_mappings?select=system_plan_id,service_provider_id&limit=10000', { cache: 'no-store' }).catch(
        () => null as Response | null,
      ),
    ])
    console.log("Raw plans", rawPlans)
  } catch (error) {
    if (isMissingAggregatorSchemaError(error)) {
      return NextResponse.json({
        configured: true,
        schemaReady: false,
        rawPlans: [],
        systemPlans: [],
        message: 'Apply supabase/multi_provider_aggregator_schema.sql to enable the aggregator catalog.',
      })
    }
    throw error
  }

  const providerCounts = new Map<string, Set<string>>()
  if (mappingRes?.ok) {
    const mappings = (await mappingRes.json()) as { system_plan_id: string; service_provider_id: string }[]
    for (const mapping of mappings) {
      if (!providerCounts.has(mapping.system_plan_id)) providerCounts.set(mapping.system_plan_id, new Set())
      providerCounts.get(mapping.system_plan_id)?.add(mapping.service_provider_id)
    }
  }

  return NextResponse.json({
    configured: true,
    schemaReady: true,
    rawPlans,
    systemPlans: systemPlans.map((plan: any) => ({
      ...plan,
      linkedProvidersCount: providerCounts.get(plan.id)?.size ?? 0,
      availableProvidersCount: providerCounts.get(plan.id)?.size ?? 0,
    })),
  })
}
