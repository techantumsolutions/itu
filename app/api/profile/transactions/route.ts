import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import {
  isHiddenUserTransaction,
  resolveTransactionDisplayStatus,
} from '@/lib/transactions/display-status'

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
  recharge_orders: Array<{
    status: string | null
  }> | null
}

function mapTransaction(row: TransactionRow) {
  const rechargeOrder = row.recharge_orders?.[0] ?? null
  const displayStatus = resolveTransactionDisplayStatus({
    type: row.type,
    transactionStatus: row.status,
    rechargeOrderStatus: rechargeOrder?.status,
  })

  return {
    id: row.id,
    userId: row.user_id ?? '',
    type: row.type,
    amount: Number(row.amount) || 0,
    currency: row.currency,
    status: displayStatus,
    transactionStatus: row.status,
    rechargeStatus: rechargeOrder?.status ?? null,
    description: row.description ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const res = await supabaseRest(
      `transactions?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,type,amount,currency,status,description,metadata,created_at,recharge_orders(status)&order=created_at.desc`,
      { cache: 'no-store' },
    )
    if (!res.ok) return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })

    const rawRows = (await res.json()) as TransactionRow[]
    const filteredRows = rawRows.filter((row) =>
      !isHiddenUserTransaction({
        type: row.type,
        status: row.status,
        description: row.description,
        metadata: row.metadata,
      }),
    )

    const transactions = filteredRows.map(mapTransaction)
    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('profile/transactions:', error)
    return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })
  }
}
