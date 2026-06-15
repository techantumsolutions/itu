import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggAudit } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { slugify } from '@/lib/aggregator/signature'
import { logAdminActivity } from '@/lib/auth/audit'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await adminCanUseFeature(request, 'integrations', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const { status, system_operator_name } = body

  if (status && status !== 'ACTIVE' && status !== 'INACTIVE') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Get current state for audit log
  const beforeRes = await supabaseRest(`system_operators?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { cache: 'no-store' })
  const beforeRows = beforeRes.ok ? await beforeRes.json() : []
  const before = beforeRows[0] ?? null

  const patchData: Record<string, any> = {}
  if (status) patchData.status = status
  if (system_operator_name) {
    patchData.system_operator_name = system_operator_name
    patchData.slug = slugify(system_operator_name)
  }

  if (Object.keys(patchData).length === 0) {
    return NextResponse.json({ error: 'Nothing to patch' }, { status: 400 })
  }

  const res = await supabaseRest(`system_operators?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patchData),
  })

  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: 500 })
  }

  const rows = await res.json()
  const after = rows[0] ?? null

  const actor = getRequestUser(request)
  await aggAudit({
    actor: actor?.email ?? 'admin',
    action: 'operator.patch',
    entityType: 'system_operator',
    entityId: id,
    before,
    after,
    details: patchData,
  }).catch(() => {})

  await logAdminActivity({
    action: 'Update System Operator',
    pageName: 'Integrations',
    details: { id, patch: patchData },
  })

  return NextResponse.json({ success: true, operator: after })
}
