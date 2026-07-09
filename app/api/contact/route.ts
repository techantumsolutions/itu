import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, subject, phone, message } = body

    if (!name || !email || !subject) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const payload = {
      name,
      email,
      subject,
      phone: phone || null,
      message: message || null,
      status: 'new',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const res = await supabaseRest('contact_leads', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Prefer: 'return=minimal',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to submit form' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
