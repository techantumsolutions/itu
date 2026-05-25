import { NextResponse } from 'next/server'
import { guardCatalog } from '@/lib/db/require-catalog'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = guardCatalog()
  if (denied) return denied

  const { id } = await ctx.params
  const sku = (id ?? '').trim()
  if (!sku) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Prefer existing catalog `plans` table by sku_code (backward compatible).
  const q = `plans?select=*&sku_code=eq.${encodeURIComponent(sku)}&limit=1`
  const res = await supabaseRest(q)
  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch plan' }, { status: 500 })
  const rows = (await res.json()) as any[]
  const plan = rows?.[0]
  if (!plan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ plan })
}

