import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { deleteRoutingRule, getRoutingRule, updateRoutingRule } from '@/lib/routing/repository'

type Params = { params: Promise<{ id: string }> }

export async function PUT(request: Request, { params }: Params) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const existing = await getRoutingRule(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const rule = await updateRoutingRule(id, {
    ruleName: typeof body.ruleName === 'string' ? body.ruleName.trim() : undefined,
    countryId:
      body.countryId === null
        ? null
        : typeof body.countryId === 'string'
          ? body.countryId.trim().toUpperCase() || null
          : undefined,
    operatorId:
      body.operatorId === null
        ? null
        : typeof body.operatorId === 'string'
          ? body.operatorId.trim() || null
          : undefined,
    productType:
      body.productType === null
        ? null
        : typeof body.productType === 'string'
          ? body.productType.trim() || null
          : undefined,
    providerId: typeof body.providerId === 'string' ? body.providerId.trim() : undefined,
    priority: typeof body.priority === 'number' ? body.priority : undefined,
    status: body.status === 'INACTIVE' ? 'INACTIVE' : body.status === 'ACTIVE' ? 'ACTIVE' : undefined,
    effectiveFrom: body.effectiveFrom === null ? null : typeof body.effectiveFrom === 'string' ? body.effectiveFrom : undefined,
    effectiveTo: body.effectiveTo === null ? null : typeof body.effectiveTo === 'string' ? body.effectiveTo : undefined,
  })

  if (!rule) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ rule })
}

export async function DELETE(request: Request, { params }: Params) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const ok = await deleteRoutingRule(id)
  if (!ok) return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  return NextResponse.json({ success: true })
}
