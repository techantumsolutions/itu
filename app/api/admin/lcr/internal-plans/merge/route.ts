import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { aggMergeInternalPlans } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { logAdminActivity } from '@/lib/auth/audit'

const mergeSchema = z.object({
  targetPlanId: z.string().uuid(),
  sourcePlanIds: z.array(z.string().uuid()).nonempty(),
})

export async function POST(request: Request) {
  if (!(await adminCanUseFeature(request, 'products'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = mergeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid merge payload', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { targetPlanId, sourcePlanIds } = parsed.data

  if (sourcePlanIds.includes(targetPlanId)) {
    return NextResponse.json(
      { error: 'Target plan cannot be in the list of source plans to merge' },
      { status: 400 }
    )
  }

  try {
    const actor = getRequestUser(request)
    const result = await aggMergeInternalPlans(targetPlanId, sourcePlanIds, actor?.email ?? 'admin')

    await logAdminActivity({
      action: 'Merge Internal Plans',
      pageName: 'Integrations',
      details: { targetPlanId, sourcePlanIds },
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[plans/merge]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to merge plans' },
      { status: 500 }
    )
  }
}
