import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { requireAdminPermission, requireAnyAdminPermission } from '@/lib/auth/require-admin-feature'
import { logAdminActivity } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await requireAnyAdminPermission(req, ['leads.view', 'customers.view'])
  if (denied) return denied

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    let query = 'contact_leads?select=*&order=created_at.desc'

    if (status && status !== 'all') {
      query += `&status=eq.${encodeURIComponent(status)}`
    }

    const res = await supabaseRest(query)
    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    let leads = await res.json()

    if (search) {
      const term = search.toLowerCase()
      leads = leads.filter((lead: any) => 
        (lead.name && lead.name.toLowerCase().includes(term)) ||
        (lead.email && lead.email.toLowerCase().includes(term)) ||
        (lead.subject && lead.subject.toLowerCase().includes(term)) ||
        (lead.message && lead.message.toLowerCase().includes(term)) ||
        (lead.phone && lead.phone.toLowerCase().includes(term))
      )
    }

    await logAdminActivity({
      action: 'View Leads',
      pageName: 'Leads',
    })

    return NextResponse.json({ leads })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const denied = await requireAnyAdminPermission(req, ['leads.edit', 'customers.edit'])
  if (denied) return denied

  try {
    const body = await req.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const res = await supabaseRest(`contact_leads?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString()
      }),
      headers: {
        Prefer: 'return=minimal'
      }
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Update Lead Status',
      pageName: 'Leads',
      details: { id, status },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update lead status' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const denied = await requireAdminPermission(req, 'customers.delete')
  if (denied) return denied

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing lead ID' }, { status: 400 })
    }

    const res = await supabaseRest(`contact_leads?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Delete Lead',
      pageName: 'Leads',
      details: { id },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
