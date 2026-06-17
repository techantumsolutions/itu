import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { createTicket, listTicketsForUser } from '@/lib/tickets/db-persistence'

export async function GET(request: Request) {
  const user = getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tickets = await listTicketsForUser(user.id)
    return NextResponse.json({ tickets })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const user = getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : ''
    const transactionCreatedAt =
      typeof body.transactionCreatedAt === 'string' ? body.transactionCreatedAt.trim() : ''
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const attachmentUrl = typeof body.attachmentUrl === 'string' ? body.attachmentUrl.trim() : ''
    if (!subject || !description) {
      return NextResponse.json({ error: 'Subject and description are required' }, { status: 400 })
    }
    if (transactionId && transactionCreatedAt) {
      const createdAt = new Date(transactionCreatedAt)
      if (!Number.isNaN(createdAt.getTime())) {
        const ageMs = Date.now() - createdAt.getTime()
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
        if (ageMs > sevenDaysMs) {
          return NextResponse.json(
            {
              error:
                'Complaints are allowed only within 1 week. Please contact support by email/contact form for older transactions.',
            },
            { status: 400 },
          )
        }
      }
    }

    const ticket = await createTicket({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      transactionId: transactionId || undefined,
      subject,
      description,
      attachmentUrl: attachmentUrl || undefined,
    })
    return NextResponse.json({ ticket })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
