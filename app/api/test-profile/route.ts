import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' })

  try {
    const res = await supabaseRest(
      `profiles?id=eq.${encodeURIComponent(id)}&select=id,email,name,phone,country_code,country,app_role,admin_permissions,image&limit=1`,
      { cache: 'no-store' }
    )
    if (!res.ok) {
      return NextResponse.json({ error: await res.text(), status: res.status })
    }
    const data = await res.json()
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown' })
  }
}
