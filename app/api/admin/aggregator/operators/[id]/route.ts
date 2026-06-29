import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggAudit } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { logAdminActivity } from '@/lib/auth/audit'
import {
  recordAdminOperatorRename,
  stableOperatorSlugForRename,
} from '@/lib/aggregator/admin-operator-rename'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await adminCanUseFeature(request, 'integrations'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const { status, system_operator_name } = body

  if (status && status !== 'ACTIVE' && status !== 'INACTIVE') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const beforeRes = await supabaseRest(`system_operators?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { cache: 'no-store' })
  const beforeRows = beforeRes.ok ? await beforeRes.json() : []
  const before = beforeRows[0] ?? null

  const patchData: Record<string, unknown> = {}
  if (status) patchData.status = status

  const oldName = String(before?.system_operator_name ?? '').trim()
  const newName = typeof system_operator_name === 'string' ? system_operator_name.trim() : ''

  if (system_operator_name !== undefined && !newName) {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
  }

  if (newName) {
    patchData.system_operator_name = newName
    if (oldName && oldName !== newName) {
      patchData.name_manually_edited = true
      patchData.slug = stableOperatorSlugForRename(oldName, before?.slug)
    }
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

  if (newName && oldName && oldName !== newName && before?.country_id) {
    const actor = getRequestUser(request)
    await recordAdminOperatorRename({
      systemOperatorId: id,
      oldName,
      newName,
      countryId: String(before.country_id),
      actorEmail: actor?.email ?? 'admin',
    }).catch((err) => {
      console.error('[operators/patch] Failed to record admin rename metadata:', err)
    })
  }

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
