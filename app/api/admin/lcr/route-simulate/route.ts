import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { routeInternalPlan } from '@/lib/lcr-v2/routing'

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const internalPlanId = typeof body.internalPlanId === 'string' ? body.internalPlanId.trim() : ''
  if (!internalPlanId) return NextResponse.json({ error: 'internalPlanId is required' }, { status: 400 })

  const decision = await routeInternalPlan({ internalPlanId })
  return NextResponse.json({ success: true, decision })
}

