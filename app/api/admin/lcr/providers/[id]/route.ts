import { NextResponse } from 'next/server'
import { isAdminRequest, getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const actor = getRequestUser(request)
  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string') patch.name = body.name.trim()
  if (typeof body.adapterKey === 'string') patch.adapter_key = body.adapterKey.trim().toLowerCase()
  if (typeof body.baseUrl === 'string') patch.base_url = body.baseUrl.trim()
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive
  if (typeof body.priority === 'number') patch.priority = body.priority
  if (typeof body.refreshIntervalMinutes === 'number') patch.refresh_interval_minutes = body.refreshIntervalMinutes
  if (Array.isArray(body.supportedCountries)) patch.supported_countries = body.supportedCountries
  if (typeof body.credentialsEncrypted === 'string' || body.credentialsEncrypted === null) patch.credentials_encrypted = body.credentialsEncrypted

  const res = await supabaseRest(`lcr_providers?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })

  await supabaseRest('lcr_audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      actor: actor?.email ?? 'admin',
      action: 'provider.update',
      entity_type: 'lcr_provider',
      entity_id: id,
      details: patch,
    }),
  }).catch(() => {})

  await logAdminActivity({
    action: 'Update Provider',
    pageName: 'Providers',
    details: { id, patch },
  })

  const rows = (await res.json()) as any[]
  return NextResponse.json({ provider: rows?.[0] ?? null })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const actor = getRequestUser(request)
  const { id } = await ctx.params

  const res = await supabaseRest(`lcr_providers?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) return NextResponse.json({ error: await res.text() }, { status: 500 })

  await supabaseRest('lcr_audit_logs', {
    method: 'POST',
    body: JSON.stringify({
      actor: actor?.email ?? 'admin',
      action: 'provider.delete',
      entity_type: 'lcr_provider',
      entity_id: id,
      details: {},
    }),
  }).catch(() => {})

  await logAdminActivity({
    action: 'Delete Provider',
    pageName: 'Providers',
    details: { id },
  })

  return NextResponse.json({ success: true })
}

