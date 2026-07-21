/**
 * Admin wallet refund — thin client for Postgres `admin_process_wallet_refund`.
 * Atomicity / locking / idempotency live in the SQL function (single DB transaction).
 */

import { supabaseRpc } from '@/lib/db/supabase-rest'

export type WalletRefundResult =
  | {
      ok: true
      idempotent: boolean
      transactionId: string
      refundId?: string
      refundTransactionId?: string
      amount?: number
      currency?: string
      message: string
      code: string
    }
  | {
      ok: false
      error: string
      code: string
      status: number
    }

function httpStatusForCode(code: string): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404
    case 'MISSING_ID':
    case 'INVALID_TYPE':
    case 'NO_USER':
    case 'NOT_ELIGIBLE':
      return 400
    default:
      return 400
  }
}

export async function processAdminWalletRefund(input: {
  transactionId: string
  adminUserId?: string | null
}): Promise<WalletRefundResult> {
  const transactionId = input.transactionId.trim()
  if (!transactionId) {
    return { ok: false, error: 'Transaction ID is required', code: 'MISSING_ID', status: 400 }
  }

  const res = await supabaseRpc('admin_process_wallet_refund', {
    p_transaction_id: transactionId,
    p_admin_user_id: input.adminUserId?.trim() || null,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // Migration not applied yet
    if (res.status === 404 || /function .* does not exist/i.test(text)) {
      return {
        ok: false,
        error:
          'Refund RPC is not installed. Apply migration 20260720130000_atomic_wallet_refund.sql',
        code: 'RPC_MISSING',
        status: 503,
      }
    }
    console.error('[admin refund] RPC failed', res.status, text)
    return {
      ok: false,
      error: 'Refund processing failed',
      code: 'RPC_ERROR',
      status: 500,
    }
  }

  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid refund RPC response', code: 'RPC_INVALID', status: 500 }
  }

  const code = typeof body.code === 'string' ? body.code : 'UNKNOWN'
  if (body.ok === true) {
    return {
      ok: true,
      idempotent: body.idempotent === true,
      transactionId: String(body.transaction_id ?? transactionId),
      refundId: typeof body.refund_id === 'string' ? body.refund_id : undefined,
      refundTransactionId:
        typeof body.refund_transaction_id === 'string' ? body.refund_transaction_id : undefined,
      amount: typeof body.amount === 'number' ? body.amount : undefined,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
      message:
        typeof body.message === 'string' ? body.message : 'Refund credited to user wallet',
      code,
    }
  }

  return {
    ok: false,
    error: typeof body.error === 'string' ? body.error : 'Refund failed',
    code,
    status: httpStatusForCode(code),
  }
}
