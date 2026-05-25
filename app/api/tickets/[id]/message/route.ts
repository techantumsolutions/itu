import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { addMessage, getTicketForUser } from '@/lib/tickets/db-persistence'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: Ctx) {
  const user = getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: ticketId } = await context.params

  try {
    const existing = await getTicketForUser(ticketId, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (existing.status === 'resolved') {
      return NextResponse.json({ error: 'This ticket is resolved' }, { status: 400 })
    }

    const body = await request.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const msg = await addMessage({ ticketId, senderType: 'user', message })
    return NextResponse.json({ message: msg })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
