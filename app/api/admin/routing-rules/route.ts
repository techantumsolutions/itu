import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { createRoutingRule, listRoutingRules } from '@/lib/routing/repository'
import { logAdminActivity } from '@/lib/auth/audit'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rules = await listRoutingRules()
  return NextResponse.json({ rules })
}

export async function POST(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const ruleName = typeof body.ruleName === 'string' ? body.ruleName.trim() : ''
  const providerId = typeof body.providerId === 'string' ? body.providerId.trim() : ''
  if (!ruleName || !providerId) {
    return NextResponse.json({ error: 'ruleName and providerId are required' }, { status: 400 })
  }

  const rule = await createRoutingRule({
    ruleName,
    providerId,
    countryId: typeof body.countryId === 'string' ? body.countryId.trim().toUpperCase() || null : null,
    operatorId: typeof body.operatorId === 'string' ? body.operatorId.trim() || null : null,
    productType: typeof body.productType === 'string' ? body.productType.trim() || null : null,
    priority: typeof body.priority === 'number' ? body.priority : 100,
    status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
    effectiveFrom: typeof body.effectiveFrom === 'string' ? body.effectiveFrom : null,
    effectiveTo: typeof body.effectiveTo === 'string' ? body.effectiveTo : null,
  })

  if (!rule) {
    return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  }

  await logAdminActivity({
    action: 'Create Routing Rule',
    pageName: 'Routing',
    details: { ruleName, providerId, countryId: body.countryId, operatorId: body.operatorId },
  })

  return NextResponse.json({ rule }, { status: 201 })
}
