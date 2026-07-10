import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { loadAdminDashboardMetrics } from '@/lib/admin/dashboard-metrics'
import { logAdminActivity } from '@/lib/auth/audit'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'dashboard'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const metrics = await loadAdminDashboardMetrics()

    await logAdminActivity({
      action: 'View Reports',
      pageName: 'Reports',
    })

    return NextResponse.json({
      summary: metrics.summary,
      sales: metrics.sales,
      topProducts: metrics.topProducts,
    })
  } catch (e) {
    console.error('[admin/dashboard] failed to load metrics', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }
}
