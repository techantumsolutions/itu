import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { getTicketAdmin, setTicketStatus } from '@/lib/tickets/db-persistence'
import type { TicketStatus } from '@/lib/tickets/types'

type Ctx = { params: Promise<{ id: string }> }

const ALLOWED: TicketStatus[] = ['open', 'in_progress', 'resolved']

export async function PATCH(request: Request, context: Ctx) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
    return NextResponse.json({ ticket })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
