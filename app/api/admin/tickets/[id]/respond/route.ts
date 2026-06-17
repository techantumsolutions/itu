import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { addMessage, bumpToInProgressIfNeeded, getTicketAdmin } from '@/lib/tickets/db-persistence'
import type { Ticket } from '@/lib/tickets/types'
import { logAdminActivity } from '@/lib/auth/audit'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: ticketId } = await context.params

  try {
    const ticket = await getTicketAdmin(ticketId)
    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (ticket.status === 'resolved') {
      return NextResponse.json({ error: 'Ticket is resolved' }, { status: 400 })
    }

    const body = await request.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const msg = await addMessage({ ticketId, senderType: 'admin', message })
    await bumpToInProgressIfNeeded(ticketId)

    const updated = await getTicketAdmin(ticketId)
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const ticketOut: Ticket = {
      id: updated.id,
      userId: updated.userId,
      userEmail: updated.userEmail,
      userName: updated.userName,
      subject: updated.subject,
      description: updated.description,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }
    await logAdminActivity({
      action: 'Respond to Ticket',
      pageName: 'Support Tickets',
      details: { ticketId },
    })

    return NextResponse.json({ message: msg, ticket: ticketOut })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
