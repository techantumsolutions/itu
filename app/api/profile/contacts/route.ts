import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const res = await supabaseRest(
      `user_contacts?user_id=eq.${encodeURIComponent(userId)}&select=id,phone,name&order=created_at.desc`,
      { cache: 'no-store' }
    )

    if (!res.ok) {
      const errText = await res.text()
      console.error('[GET /api/profile/contacts] DB error:', errText)
      return NextResponse.json({ error: 'Failed to fetch contacts from DB' }, { status: res.status })
    }

    const contacts = await res.json()
    return NextResponse.json({ ok: true, contacts })
  } catch (err: any) {
    console.error('[GET /api/profile/contacts] Unhandled error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const isArray = Array.isArray(body)
    const contactsToSave = isArray ? body : [body]

    if (contactsToSave.length === 0) {
      return NextResponse.json({ ok: true, contacts: [] })
    }

    const rows = []
    for (const item of contactsToSave) {
      const phone = String(item?.phone || '').trim()
      const name = String(item?.name || '').trim()
      if (phone && name) {
        rows.push({
          user_id: userId,
          phone,
          name,
          updated_at: new Date().toISOString(),
        })
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No valid contacts provided' }, { status: 400 })
    }

    const res = await supabaseRest('user_contacts', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(rows),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[POST /api/profile/contacts] DB error:', errText)
      return NextResponse.json({ error: 'Failed to save contact to DB' }, { status: res.status })
    }

    const saved = await res.json()
    return NextResponse.json({ ok: true, contacts: saved })
  } catch (err: any) {
    console.error('[POST /api/profile/contacts] Unhandled error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, phone, name } = await request.json().catch(() => ({}))
    if (!id) {
      return NextResponse.json({ error: 'Contact ID is required for update' }, { status: 400 })
    }
    const trimmedPhone = String(phone || '').trim()
    const trimmedName = String(name || '').trim()
    if (!trimmedPhone || !trimmedName) {
      return NextResponse.json({ error: 'Phone and name are required' }, { status: 400 })
    }

    const res = await supabaseRest(`user_contacts?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        phone: trimmedPhone,
        name: trimmedName,
        updated_at: new Date().toISOString(),
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[PATCH /api/profile/contacts] DB error:', errText)
      return NextResponse.json({ error: 'Failed to update contact in DB' }, { status: res.status })
    }

    const updated = await res.json()
    return NextResponse.json({ ok: true, contact: updated[0] || null })
  } catch (err: any) {
    console.error('[PATCH /api/profile/contacts] Unhandled error:', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
