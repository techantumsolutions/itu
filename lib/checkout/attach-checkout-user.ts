import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type OwnershipClaimResult =
  | { ok: true; bound: boolean }
  | { ok: false; error: string; status: number }

/**
 * Enforce that `transactionId` is owned by `userId`.
 *
 * - Already owned by this user → ok
 * - Owned by someone else → 403
 * - `user_id` IS NULL → atomic bind (only one concurrent winner)
 * - Lost the bind race → 403 unless the winner is this user (re-read)
 */
export async function claimCheckoutTransactionOwnership(input: {
  userId: string
  transactionId: string
}): Promise<OwnershipClaimResult> {
  const userId = input.userId.trim()
  const transactionId = input.transactionId.trim()
  if (!userId || !transactionId) {
    return { ok: false, error: 'userId and transactionId are required', status: 400 }
  }

  const txnRes = await supabaseRest(
    `transactions?id=eq.${enc(transactionId)}&select=id,user_id&limit=1`,
    { cache: 'no-store' },
  )
  if (!txnRes.ok) {
    return { ok: false, error: 'Unable to load transaction', status: 400 }
  }
  const txnRows = (await txnRes.json().catch(() => [])) as Array<{
    id?: string
    user_id?: string | null
  }>
  const txn = txnRows[0]
  if (!txn?.id) {
    return { ok: false, error: 'Transaction not found', status: 404 }
  }

  const existingOwner = txn.user_id ? String(txn.user_id) : null
  if (existingOwner) {
    if (existingOwner !== userId) {
      return { ok: false, error: 'Forbidden', status: 403 }
    }
    // Ensure related rows are aligned (idempotent).
    await bindRelatedCheckoutRows({ userId, transactionId }).catch(() => {})
    return { ok: true, bound: false }
  }

  // Atomic bind: only the request that matches user_id IS NULL wins.
  const claimRes = await supabaseRest(
    `transactions?id=eq.${enc(transactionId)}&user_id=is.null`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId }),
    },
  )
  if (!claimRes.ok) {
    return { ok: false, error: 'Failed to claim transaction ownership', status: 500 }
  }
  const claimed = (await claimRes.json().catch(() => [])) as Array<{ id?: string; user_id?: string }>
  if (claimed.length > 0 && String(claimed[0]?.user_id ?? '') === userId) {
    await bindRelatedCheckoutRows({ userId, transactionId }).catch(() => {})
    return { ok: true, bound: true }
  }

  // Lost the race — re-read and allow only if we somehow already own it.
  const againRes = await supabaseRest(
    `transactions?id=eq.${enc(transactionId)}&select=id,user_id&limit=1`,
    { cache: 'no-store' },
  )
  const againRows = againRes.ok
    ? ((await againRes.json().catch(() => [])) as Array<{ user_id?: string | null }>)
    : []
  const ownerNow = againRows[0]?.user_id ? String(againRows[0].user_id) : null
  if (ownerNow === userId) {
    await bindRelatedCheckoutRows({ userId, transactionId }).catch(() => {})
    return { ok: true, bound: false }
  }

  return { ok: false, error: 'Forbidden', status: 403 }
}

async function bindRelatedCheckoutRows(input: {
  userId: string
  transactionId: string
}): Promise<void> {
  await supabaseRest(
    `recharge_orders?transaction_id=eq.${enc(input.transactionId)}&user_id=is.null`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: input.userId }),
    },
  )
}

/** Backfill user_id on checkout rows created before auth was resolved. */
export async function attachUserIdToCheckoutRecords(input: {
  userId: string
  transactionId?: string | null
  paymentOrderId?: string | null
}): Promise<void> {
  const userId = input.userId.trim()
  if (!userId) return

  if (input.transactionId) {
    // Prefer the atomic claim path so concurrent attaches cannot steal ownership.
    await claimCheckoutTransactionOwnership({
      userId,
      transactionId: input.transactionId,
    }).catch(() => {})
  }

  if (input.paymentOrderId) {
    await supabaseRest(`payment_orders?id=eq.${enc(input.paymentOrderId)}&user_id=is.null`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId }),
    }).catch(() => {})
  }
}
