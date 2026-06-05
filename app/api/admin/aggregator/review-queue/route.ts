import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'integrations', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'PENDING'
  const entityType = searchParams.get('entityType')

  const query = [`status=eq.${status}`]
  if (entityType) {
    query.push(`entity_type=eq.${entityType}`)
  }
  query.push('order=created_at.desc')

  const res = await supabaseRest(`classification_review_queue?${query.join('&')}`, { cache: 'no-store' })
  if (!res.ok) {
    return NextResponse.json({ error: await res.text() }, { status: 500 })
  }

  const items = await res.json()
  return NextResponse.json({ items })
}
