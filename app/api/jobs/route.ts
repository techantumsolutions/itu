import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await supabaseRest('careers_jobs?select=*&is_active=eq.true&order=created_at.desc')
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }
    const jobs = await res.json()
    return NextResponse.json({ jobs })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
