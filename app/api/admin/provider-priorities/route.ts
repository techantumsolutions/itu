import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { listProviderPriorities, replaceProviderPriorities } from '@/lib/routing/repository'
import { logAdminActivity } from '@/lib/auth/audit'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const priorities = await listProviderPriorities()

  await logAdminActivity({
    action: 'View Provider Priorities',
    pageName: 'Routing',
  })

  return NextResponse.json({ priorities, source: 'lcr_providers' })
}

export async function PUT(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const items = Array.isArray(body.priorities)
    ? body.priorities
        .filter((p: unknown) => p && typeof p === 'object')
        .map((p: { providerId?: string; priority?: number }) => ({
          providerId: String(p.providerId ?? ''),
          priority: Number(p.priority ?? 100),
        }))
        .filter((p: { providerId: string }) => p.providerId)
    : []

  if (!items.length) {
    return NextResponse.json({ error: 'priorities array is required' }, { status: 400 })
  }

  const priorities = await replaceProviderPriorities(items)

  await logAdminActivity({
    action: 'Update Provider Priorities',
    pageName: 'Routing',
    details: { prioritiesCount: items.length },
  })

  return NextResponse.json({ priorities })
}
