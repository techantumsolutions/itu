import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'ads'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const campaignId = searchParams.get('campaignId')
  
  const endpoint = campaignId 
    ? `ads_creatives?campaign_id=eq.${campaignId}&order=created_at.desc` 
    : `ads_creatives?select=*,campaign:ads_campaigns(name)&order=created_at.desc`

  const res = await supabaseRest(endpoint, { cache: 'no-store' })

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to load creatives' }, { status: 500 })
  }

  const creatives = await res.json()
  return NextResponse.json({ creatives })
}

export async function POST(request: Request) {
  if (!(await adminCanUseFeature(request, 'ads'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    if (!body.campaign_id || !body.format || !body.placement_key || !body.media_url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (body.id) {
      const res = await supabaseRest(`ads_creatives?id=eq.${body.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(await res.text())
      return NextResponse.json({ success: true, message: 'Creative updated' })
    } else {
      const res = await supabaseRest('ads_creatives', {
        method: 'POST',
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(await res.text())
      return NextResponse.json({ success: true, message: 'Creative created' })
    }

  } catch (error: any) {
    console.error('Creative save error:', error.message)
    return NextResponse.json({ error: 'Failed to save creative' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!(await adminCanUseFeature(request, 'ads'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const res = await supabaseRest(`ads_creatives?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Creative delete error:', error.message)
    return NextResponse.json({ error: 'Failed to delete creative' }, { status: 500 })
  }
}
