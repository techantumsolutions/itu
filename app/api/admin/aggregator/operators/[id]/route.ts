import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggAudit } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await adminCanUseFeature(request, 'integrations', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const { status } = body

  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Get current state for audit log
  const beforeRes = await supabaseRest(`system_operators?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { cache: 'no-store' })
  const beforeRows = beforeRes.ok ? await beforeRes.json() : []
  const before = beforeRows[0] ?? null

  const res = await supabaseRest(`system_operators?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: 500 })
  }

  const rows = await res.json()
  const after = rows[0] ?? null

  const actor = getRequestUser(request)
  await aggAudit({
    actor: actor?.email ?? 'admin',
    action: 'operator.status_toggle',
    entityType: 'system_operator',
    entityId: id,
    before,
    after,
    details: { status },
  }).catch(() => {})

  return NextResponse.json({ success: true, operator: after })
}
