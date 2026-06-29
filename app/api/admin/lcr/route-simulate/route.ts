import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { routeInternalPlan } from '@/lib/lcr-v2/routing'

export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'lcr.view')
  if (denied) return denied
  const body = await request.json().catch(() => ({}))
  const internalPlanId = typeof body.internalPlanId === 'string' ? body.internalPlanId.trim() : ''
  if (!internalPlanId) return NextResponse.json({ error: 'internalPlanId is required' }, { status: 400 })

  const decision = await routeInternalPlan({ internalPlanId })
  return NextResponse.json({ success: true, decision })
}

