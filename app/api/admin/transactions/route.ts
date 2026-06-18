import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

type TransactionRow = {
  id: string
  user_id: string | null
  type: string
  amount: number | string
  currency: string
  status: string
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

function mapTransaction(row: TransactionRow) {
  return {
    id: row.id,
    userId: row.user_id ?? '',
    type: row.type,
    amount: Number(row.amount) || 0,
    currency: row.currency,
    status: row.status,
    description: row.description ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'transactions', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const status = (url.searchParams.get('status') ?? '').trim()
  const limit = Math.min((Number(url.searchParams.get('limit') ?? '100')) || 100, 500)
  const statusFilter = status && status !== 'all' ? `status=eq.${encodeURIComponent(status)}&` : ''

  const res = await supabaseRest(
    `transactions?${statusFilter}select=id,user_id,type,amount,currency,status,description,metadata,created_at&order=created_at.desc&limit=${limit}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })
  const transactions = ((await res.json()) as TransactionRow[]).map(mapTransaction)
  return NextResponse.json({ transactions })
}
