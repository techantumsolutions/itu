import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'ads', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch campaigns
  const res = await supabaseRest(
    'ads_campaigns?select=*&order=created_at.desc',
    { cache: 'no-store' }
  )

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 })
  }

  const campaigns = await res.json()
  return NextResponse.json({ campaigns })
}

export async function POST(request: Request) {
  if (!(await adminCanUseFeature(request, 'ads', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    // Minimal validation
    if (!body.name || !body.start_date || !body.end_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Ensure dates are valid
    if (new Date(body.start_date) >= new Date(body.end_date)) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
    }

    // If ID is present, we update, else insert. 
    // PostgREST POST with Prefer: resolution=merge-duplicates acts as upsert if on_conflict is provided,
    // but typically PATCH is for updates. Let's do explicit checking.
    if (body.id) {
      const res = await supabaseRest(`ads_campaigns?id=eq.${body.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(await res.text())
      return NextResponse.json({ success: true, message: 'Campaign updated' })
    } else {
      const res = await supabaseRest('ads_campaigns', {
        method: 'POST',
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(await res.text())
      return NextResponse.json({ success: true, message: 'Campaign created' })
    }

  } catch (error: any) {
    console.error('Campaign save error:', error.message)
    return NextResponse.json({ error: 'Failed to save campaign' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!(await adminCanUseFeature(request, 'ads', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

    const res = await supabaseRest(`ads_campaigns?id=eq.${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Campaign delete error:', error.message)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
