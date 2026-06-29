import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { getTicketAdmin, setTicketStatus } from '@/lib/tickets/db-persistence'
import type { TicketStatus } from '@/lib/tickets/types'
import { logAdminActivity } from '@/lib/auth/audit'
import { notifyStatusUpdate } from '@/lib/tickets/socket-notifier'

type Ctx = { params: Promise<{ id: string }> }

const ALLOWED: TicketStatus[] = ['open', 'in_progress', 'resolved']

export async function PATCH(request: Request, context: Ctx) {
  const denied = await requireAdminPermission(request, 'tickets.edit')
  if (denied) return denied

  const { id: ticketId } = await context.params

  try {
    const existing = await getTicketAdmin(ticketId)
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const status = body.status as TicketStatus
    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const ticket = await setTicketStatus(ticketId, status)

    if (ticket) {
      await notifyStatusUpdate(ticketId, ticket.status)
    }

    await logAdminActivity({
      action: 'Change Ticket Status',
      pageName: 'Support Tickets',
      details: { ticketId, status },
    })

    return NextResponse.json({ ticket })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
