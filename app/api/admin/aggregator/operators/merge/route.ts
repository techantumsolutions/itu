import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { aggMergeSystemOperators } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'

const mergeSchema = z.object({
  targetOperatorId: z.string().uuid(),
  sourceOperatorIds: z.array(z.string().uuid()).nonempty(),
})

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) {
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

  const { targetOperatorId, sourceOperatorIds } = parsed.data

  if (sourceOperatorIds.includes(targetOperatorId)) {
    return NextResponse.json(
      { error: 'Target operator cannot be in the list of source operators to merge' },
      { status: 400 }
    )
  }

  try {
    const actor = getRequestUser(request)
    const result = await aggMergeSystemOperators(targetOperatorId, sourceOperatorIds, actor?.email ?? 'admin')
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[operators/merge]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to merge operators' },
      { status: 500 }
    )
  }
}
