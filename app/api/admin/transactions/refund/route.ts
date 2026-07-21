import { NextResponse } from 'next/server'
import { requireAnyAdminPermission } from '@/lib/auth/require-admin-permission'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import { processAdminWalletRefund } from '@/lib/admin/process-wallet-refund'

/**
 * Admin wallet refund for failed recharge delivery.
 * Fulfillment is a single Postgres transaction (row lock + unique refund + wallet credit).
 *
 * Auth: transactions.refund OR wallet.manage — never transactions.view.
 */
export async function POST(request: Request) {
  const denied = await requireAnyAdminPermission(request, [
    'transactions.refund',
    'wallet.manage',
  ])
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const transactionId =
      typeof body.transactionId === 'string' ? body.transactionId.trim() : ''

    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
    }

    const adminUserId = await getUserIdFromRequest(request)
    const result = await processAdminWalletRefund({
      transactionId,
      adminUserId,
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, code: result.code },
        { status: result.status },
      )
    }

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      transactionId: result.transactionId,
      refundId: result.refundId,
      refundTransactionId: result.refundTransactionId,
      amount: result.amount,
      currency: result.currency,
      message: result.message,
      code: result.code,
    })
  } catch (error) {
    console.error('Refund processing error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
