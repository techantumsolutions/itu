import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { aggMergeSystemPlans } from '@/lib/aggregator/repository'
import { recordPlanMergeHistoryFromSystemMerge } from '@/lib/aggregator/plan-merge-history'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { logAdminActivity } from '@/lib/auth/audit'

const mergeSchema = z.object({
  targetPlanId: z.string().uuid(),
  sourcePlanIds: z.array(z.string().uuid()).nonempty(),
})

const legacyMergeSchema = z.object({
  targetId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).nonempty(),
})

function parseMergeBody(body: unknown) {
  const modern = mergeSchema.safeParse(body)
  if (modern.success) {
    return { targetPlanId: modern.data.targetPlanId, sourcePlanIds: modern.data.sourcePlanIds }
  }

  const legacy = legacyMergeSchema.safeParse(body)
  if (legacy.success) {
    return { targetPlanId: legacy.data.targetId, sourcePlanIds: legacy.data.sourceIds }
  }

  return null
}

export async function POST(request: Request) {
  if (!(await adminCanUseFeature(request, 'products', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const parsed = parseMergeBody(body)

    if (!parsed) {
      return NextResponse.json(
        {
          error: 'Invalid merge payload',
          details: 'targetPlanId (string) and sourcePlanIds (non-empty array of strings) are required',
        },
        { status: 400 },
      )
    }

    const { targetPlanId, sourcePlanIds } = parsed

    if (sourcePlanIds.includes(targetPlanId)) {
      return NextResponse.json(
        { error: 'Target plan cannot be in the list of source plans to merge' },
        { status: 400 },
      )
    }

    const ctx = await getAdminFromAccessCookie(request)
    const actorEmail = ctx?.user?.email || 'admin@system.local'

    await recordPlanMergeHistoryFromSystemMerge(targetPlanId, sourcePlanIds, actorEmail).catch((err) => {
      console.error('[history][plan] Failed to record plan merge history:', err)
    })

    const result = await aggMergeSystemPlans(targetPlanId, sourcePlanIds, actorEmail)

    await logAdminActivity({
      action: 'Merge System Plans',
      pageName: 'Integrations',
      details: { targetId, sourceIds },
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown merge error'
    console.error('Merge system plans failed:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
