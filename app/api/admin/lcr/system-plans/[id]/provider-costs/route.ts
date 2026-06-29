import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { loadSystemPlanProviderCostBreakdown } from '@/lib/admin/provider-cost-breakdown'
import { buildSystemPlanPricingConsistencyReport } from '@/lib/catalog/system-plan-pricing-consistency'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  if (!(await adminCanUseFeature(request, 'products'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const systemPlanId = (id ?? '').trim()
  if (!systemPlanId) {
    return NextResponse.json({ error: 'system plan id is required' }, { status: 400 })
  }

  try {
    const breakdown = await loadSystemPlanProviderCostBreakdown(systemPlanId)
    if (!breakdown) {
      return NextResponse.json({ error: 'System plan not found' }, { status: 404 })
    }
    const consistencyReport = await buildSystemPlanPricingConsistencyReport(systemPlanId)
    return NextResponse.json({
      breakdown,
      plan: breakdown.plan,
      providers: breakdown.providers,
      pricing_debug: breakdown.providers.map((p) => p.pricingSource).filter(Boolean),
      consistency_report: consistencyReport,
    })
  } catch (error) {
    console.error('Failed to load provider cost breakdown:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load provider cost breakdown' },
      { status: 500 },
    )
  }
}
