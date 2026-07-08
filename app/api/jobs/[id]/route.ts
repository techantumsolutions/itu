import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const res = await supabaseRest(`careers_jobs?select=*&id=eq.${encodeURIComponent(id)}&is_active=eq.true&limit=1`)
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch job details' }, { status: 500 })
    }
    const rows = await res.json()
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    return NextResponse.json({ job: rows[0] })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
