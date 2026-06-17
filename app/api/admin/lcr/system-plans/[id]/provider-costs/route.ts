import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { loadSystemPlanProviderCostBreakdown } from '@/lib/admin/provider-cost-breakdown'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  if (!(await adminCanUseFeature(request, 'products', { allowLegacyHeader: true }))) {
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
    return NextResponse.json({
      breakdown,
      plan: breakdown.plan,
      providers: breakdown.providers,
    })
  } catch (error) {
    console.error('Failed to load provider cost breakdown:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load provider cost breakdown' },
      { status: 500 },
    )
  }
}
