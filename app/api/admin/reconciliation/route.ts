import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'reconciliation'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const res = await supabaseRest(
    'reconciliation_reports?select=id,provider,period_start,period_end,status,totals,created_at,updated_at&order=created_at.desc',
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })

  await logAdminActivity({
    action: 'View Reconciliation Reports',
    pageName: 'Reconciliation',
  })

  return NextResponse.json({ reports: await res.json() })
}
