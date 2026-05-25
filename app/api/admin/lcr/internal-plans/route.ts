import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '50'), 1), 200)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)
  const countryIso3 = (url.searchParams.get('countryIso3') ?? '').trim().toUpperCase()
  const operatorRef = (url.searchParams.get('operatorRef') ?? '').trim()
  const q = [
    'internal_plans?select=id,country_iso3,operator_ref,service,subservice,category,uti_plan_name,uti_description,normalized_hash,canonical_signature,confidence,active,updated_at',
    `order=updated_at.desc&limit=${limit}&offset=${offset}`,
  ].join('&')

  const res = await supabaseRest(q, { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: 'Failed to load internal plans' }, { status: 500 })
  let rows = (await res.json()) as any[]
  if (countryIso3) rows = rows.filter((r) => String(r.country_iso3 || '').toUpperCase() === countryIso3)
  if (operatorRef) rows = rows.filter((r) => String(r.operator_ref || '') === operatorRef)

  return NextResponse.json({ internalPlans: rows, pagination: { limit, offset, returned: rows.length } })
}

