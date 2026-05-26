import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { listProviderPriorities, replaceProviderPriorities } from '@/lib/routing/repository'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const priorities = await listProviderPriorities()

  if (priorities.length === 0 && isSupabaseCatalogConfigured()) {
    const res = await supabaseRest(
      'lcr_providers?select=id,code,name,priority&is_active=eq.true&order=priority.asc',
      { cache: 'no-store' },
    )
    if (res.ok) {
      const providers = (await res.json()) as Array<{ id: string; code: string; name: string; priority: number }>
      return NextResponse.json({
        priorities: providers.map((p) => ({
          id: p.id,
          providerId: p.id,
          providerCode: p.code,
          providerName: p.name,
          priority: p.priority,
        })),
        source: 'lcr_providers',
      })
    }
  }

  return NextResponse.json({ priorities, source: 'provider_priorities' })
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
  return NextResponse.json({ priorities })
}
