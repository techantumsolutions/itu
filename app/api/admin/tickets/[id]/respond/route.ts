import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { addMessage, bumpToInProgressIfNeeded, getTicketAdmin } from '@/lib/tickets/db-persistence'
import type { Ticket } from '@/lib/tickets/types'
import { logAdminActivity } from '@/lib/auth/audit'
import { notifyNewMessage, notifyStatusUpdate } from '@/lib/tickets/socket-notifier'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Ctx) {
  const denied = await requireAdminPermission(request, 'tickets.edit')
  if (denied) return denied

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

    await notifyNewMessage(ticketId, msg)

    const updated = await getTicketAdmin(ticketId)
    if (!updated) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await notifyStatusUpdate(ticketId, updated.status)

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
