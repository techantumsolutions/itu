import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { deletePlanMergeHistory, patchPlanMergeHistory } from '@/lib/aggregator/plan-merge-history'

const patchSchema = z.object({
  isActive: z.boolean(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await adminCanUseFeature(request, 'products'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const row = await patchPlanMergeHistory(id, { isActive: parsed.data.isActive })
  if (!row) return NextResponse.json({ error: 'History rule not found' }, { status: 404 })

  return NextResponse.json({ history: row })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await adminCanUseFeature(request, 'products'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const ok = await deletePlanMergeHistory(id)
  if (!ok) return NextResponse.json({ error: 'Failed to delete history rule' }, { status: 500 })

  return NextResponse.json({ success: true })
}
