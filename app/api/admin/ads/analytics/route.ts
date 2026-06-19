import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'ads', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch all analytics for simplicity. For production with huge data, this should be a DB View or RPC.
  const res = await supabaseRest(
    'ads_analytics?select=*,creative:ads_creatives(title,placement_key,campaign:ads_campaigns(name))',
    { cache: 'no-store' }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }

  const rawData: any[] = await res.json()

  // Aggregate by creative
  const performanceMap: Record<string, any> = {}

  for (const row of rawData) {
    const cid = row.creative_id
    if (!performanceMap[cid]) {
      performanceMap[cid] = {
        creative_id: cid,
        title: row.creative?.title || 'Unknown Creative',
        campaign_name: row.creative?.campaign?.name || 'Unknown Campaign',
        placement: row.creative?.placement_key || 'Unknown',
        impressions: 0,
        clicks: 0,
        dismisses: 0,
      }
    }
    
    if (row.event_type === 'impression') performanceMap[cid].impressions++
    if (row.event_type === 'click') performanceMap[cid].clicks++
    if (row.event_type === 'dismiss') performanceMap[cid].dismisses++
  }

  const analytics = Object.values(performanceMap)

  return NextResponse.json({ analytics })
}
