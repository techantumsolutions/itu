import { NextResponse } from 'next/server'
import { getRequestUser, isAdminRequest } from '@/lib/tickets/auth-headers'
import { addNote, getTicketAdmin } from '@/lib/tickets/db-persistence'
import { logAdminActivity } from '@/lib/auth/audit'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = getRequestUser(request)
  const { id: ticketId } = await context.params

  try {
    const existing = await getTicketAdmin(ticketId)
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (!note) {
      return NextResponse.json({ error: 'Note is required' }, { status: 400 })
    }

    const createdBy = admin?.email || admin?.id || 'admin'
    const row = await addNote({ ticketId, note, createdBy })

    await logAdminActivity({
      action: 'Add Ticket Note',
      pageName: 'Support Tickets',
      details: { ticketId, createdBy },
    })

    return NextResponse.json({ note: row })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
