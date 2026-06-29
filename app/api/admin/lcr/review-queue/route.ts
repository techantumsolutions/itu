import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'lcr.view')
  if (denied) return denied

  const url = new URL(request.url)
  const status = (url.searchParams.get('status') ?? 'pending').trim().toLowerCase()
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '50'), 1), 200)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)

  const res = await supabaseRest(
    `plan_review_queue?status=eq.${encodeURIComponent(status)}&select=id,provider_id,provider_plan_id,normalized_hash,confidence_score,status,notes,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
    { cache: 'no-store' }
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to load review queue' }, { status: 500 })
  const rows = await res.json()
  return NextResponse.json({ items: rows, pagination: { limit, offset } })
}
