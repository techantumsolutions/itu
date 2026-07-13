import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { addMessage, getTicketForUser } from '@/lib/tickets/db-persistence'
import { getSupportBotQa } from '@/lib/support-bot/qa'
import { notifyNewMessage } from '@/lib/tickets/socket-notifier'

/** Apply a suggested Q&A into the ticket conversation (user question + support answer). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id: ticketId } = await params
    const body = await request.json().catch(() => ({}))
    const qaId = typeof body.qaId === 'string' ? body.qaId.trim() : ''
    if (!qaId) {
      return NextResponse.json({ error: 'qaId is required' }, { status: 400 })
    }

    const ticket = await getTicketForUser(ticketId, user.id)
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    if (ticket.status === 'resolved') {
      return NextResponse.json({ error: 'Ticket is resolved' }, { status: 400 })
    }

    const qa = await getSupportBotQa(qaId)
    if (!qa || !qa.isActive) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
    }

    const userMsg = await addMessage({
      ticketId,
      senderType: 'user',
      message: qa.question,
    })
    const supportMsg = await addMessage({
      ticketId,
      senderType: 'bot',
      message: qa.answer,
    })

    try {
      await notifyNewMessage(ticketId, userMsg)
      await notifyNewMessage(ticketId, supportMsg)
    } catch {
      /* socket optional */
    }

    return NextResponse.json({
      messages: [userMsg, supportMsg],
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to apply suggestion' },
      { status: 500 },
    )
  }
}
