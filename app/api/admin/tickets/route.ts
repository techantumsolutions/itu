import { NextResponse } from 'next/server'
import { isAdminRequest } from '@/lib/tickets/auth-headers'
import { listTicketsAdmin } from '@/lib/tickets/db-persistence'
import type { TicketStatus } from '@/lib/tickets/types'

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = (searchParams.get('status') ?? 'all') as TicketStatus | 'all'
  const q = searchParams.get('q') ?? undefined

  const allowed: (TicketStatus | 'all')[] = ['all', 'open', 'in_progress', 'resolved']
  const st = allowed.includes(status) ? status : 'all'

  try {
    const tickets = await listTicketsAdmin({ status: st, q })
    return NextResponse.json({ tickets })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
