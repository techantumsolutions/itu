import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders, adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggAudit, aggListDuplicateSuggestions } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'

const reviewSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['APPROVED', 'REJECTED', 'NEW_SYSTEM_PLAN']),
})

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const status = (searchParams.get('status') ?? 'PENDING').trim().toUpperCase()
  const limit = Number(searchParams.get('limit') ?? '50')
  const offset = Number(searchParams.get('offset') ?? '0')
  const suggestions = await aggListDuplicateSuggestions({
    status: status || undefined,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  })
  return NextResponse.json({ suggestions })
}

export async function PATCH(request: Request) {
  if (!(await adminCanManageProviders(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid review payload', issues: parsed.error.flatten() }, { status: 400 })
  const actor = getRequestUser(request)
  const res = await supabaseRest(`duplicate_plan_suggestions?id=eq.${encodeURIComponent(parsed.data.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: parsed.data.action,
      reviewed_by: actor?.email ?? 'admin',
      reviewed_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })
  const rows = (await res.json()) as any[]
  const suggestion = rows[0] ?? null
  await aggAudit({
    actor: actor?.email,
    action: `duplicate.${parsed.data.action.toLowerCase()}`,
    entityType: 'duplicate_plan_suggestion',
    entityId: parsed.data.id,
    after: suggestion,
  })
  return NextResponse.json({ suggestion })
}
