import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'ads', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const res = await supabaseRest(
    'ads?select=id,title,placement,status,target_countries,image_url,link_url,starts_at,ends_at,created_at,updated_at&order=updated_at.desc',
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to load ads' }, { status: 500 })
  return NextResponse.json({ ads: await res.json() })
}
