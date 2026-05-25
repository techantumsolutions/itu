import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'customers', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const res = await supabaseRest(
    'admin_customer_spend?select=user_id,email,name,total_spend,transaction_count,last_transaction_at&order=last_transaction_at.desc.nullslast',
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 })
  return NextResponse.json({ customers: await res.json() })
}
