import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import {
  loadAdminSystemPlans,
  patchAdminSystemPlanStatus,
} from '@/lib/admin/load-admin-system-plans'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'products'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const url = new URL(request.url)
    const payload = await loadAdminSystemPlans({
      limit: Number(url.searchParams.get('limit') ?? '500'),
      offset: Number(url.searchParams.get('offset') ?? '0'),
      countryIso3: url.searchParams.get('countryIso3') ?? '',
      operatorName: url.searchParams.get('operatorName') ?? '',
      category: url.searchParams.get('category') ?? '',
      status: url.searchParams.get('status') ?? 'all',
      q: url.searchParams.get('q') ?? '',
    })
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[admin/catalog/system-plans] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load system plans' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  if (!(await adminCanUseFeature(request, 'products'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { id?: string; active?: boolean }
    if (!body.id || typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'id and active (boolean) are required' }, { status: 400 })
    }
    await patchAdminSystemPlanStatus({ id: body.id, active: body.active })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[admin/catalog/system-plans] PATCH failed:', error)
    return NextResponse.json({ error: 'Failed to update system plan status' }, { status: 500 })
  }
}
