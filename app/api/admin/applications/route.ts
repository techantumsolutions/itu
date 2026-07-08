import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { logAdminActivity } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireAdminPermission(req, 'cms.view')
  if (denied) return denied

  try {
    const res = await supabaseRest('careers_applications?select=*,careers_jobs(title,department)&order=created_at.desc')
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
    }
    const applications = await res.json()
    return NextResponse.json({ applications })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const denied = await requireAdminPermission(req, 'cms.edit')
  if (denied) return denied

  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing application ID' }, { status: 400 })
    }

    const body = await req.json()
    const { status } = body

    if (!status) {
      return NextResponse.json({ error: 'Missing status' }, { status: 400 })
    }

    const res = await supabaseRest(`careers_applications?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
      headers: {
        Prefer: 'return=representation',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to update application status' }, { status: 500 })
    }

    const updated = await res.json()

    await logAdminActivity({
      action: 'Update Application Status',
      pageName: 'Jobs',
      details: { id, status },
    })

    return NextResponse.json({ ok: true, application: updated?.[0] })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
