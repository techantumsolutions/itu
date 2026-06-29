import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { listTicketsAdmin } from '@/lib/tickets/db-persistence'
import type { TicketStatus } from '@/lib/tickets/types'

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'tickets.view')
  if (denied) return denied

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
