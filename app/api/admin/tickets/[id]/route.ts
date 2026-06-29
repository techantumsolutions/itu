import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { getTicketAdmin } from '@/lib/tickets/db-persistence'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Ctx) {
  const denied = await requireAdminPermission(request, 'tickets.view')
  if (denied) return denied

  const { id } = await context.params

  try {
    const data = await getTicketAdmin(id)
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
