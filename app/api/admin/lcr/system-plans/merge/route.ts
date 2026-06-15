import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { aggMergeSystemPlans } from '@/lib/aggregator/repository'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import { logAdminActivity } from '@/lib/auth/audit'

export async function POST(request: Request) {
  if (!(await adminCanUseFeature(request, 'products', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { targetId, sourceIds } = body

    if (!targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return NextResponse.json(
        { error: 'targetId (string) and sourceIds (array of strings) are required' },
        { status: 400 },
      )
    }

    const ctx = await getAdminFromAccessCookie(request)
    const actorEmail = ctx?.user?.email || 'admin@system.local'

    const result = await aggMergeSystemPlans(targetId, sourceIds, actorEmail)

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
