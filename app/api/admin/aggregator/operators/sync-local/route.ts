import { NextResponse } from 'next/server'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { runLocalOperatorSync } from '@/lib/aggregator/sync-service'
import { logAdminActivity } from '@/lib/auth/audit'

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const providerId = body.providerId || 'ALL'

    // Fire and forget in the background to avoid route timeouts
    void runLocalOperatorSync(providerId).catch((err) => {
      console.error('[sync-local] Background local sync failed:', err)
    })

    await logAdminActivity({
      action: 'Local Operator Sync',
      pageName: 'Integrations',
      details: { providerId },
    })

    return NextResponse.json({
      success: true,
      message: 'Local operator sync and system plan normalization started in background.'
    })
  } catch (error: any) {
    console.error('[sync-local]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to start local operators sync' },
      { status: 500 }
    )
  }
}
