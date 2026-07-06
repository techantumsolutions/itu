import { supabaseRest } from '@/lib/db/supabase-rest'

export type CleanupPendingPaymentResult = {
  deletedTransactions: number
  deletedRechargeOrders: number
  cutoffIso: string
}

/** Remove abandoned checkout rows stuck in pending_payment longer than the cutoff (default 24h). */
export async function cleanupPendingPaymentTransactions(
  olderThanHours = 24,
): Promise<CleanupPendingPaymentResult> {
  const cutoffIso = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString()
  let deletedTransactions = 0
  let deletedRechargeOrders = 0

  while (true) {
    const res = await supabaseRest(
      `transactions?status=eq.pending_payment&created_at=lt.${encodeURIComponent(cutoffIso)}&select=id&limit=200`,
      { cache: 'no-store' },
    )
    if (!res.ok) break

    const rows = (await res.json()) as Array<{ id: string }>
    const ids = rows.map((row) => row.id).filter(Boolean)
    if (ids.length === 0) break

    const inList = ids.map(encodeURIComponent).join(',')

    const ordersRes = await supabaseRest(`recharge_orders?transaction_id=in.(${inList})&select=id`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    })
    if (ordersRes.ok) {
      const deletedOrders = (await ordersRes.json()) as Array<{ id: string }>
      deletedRechargeOrders += deletedOrders.length
    }

    const txRes = await supabaseRest(`transactions?id=in.(${inList})`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    })
    if (!txRes.ok) break

    const deletedTx = (await txRes.json()) as Array<{ id: string }>
    deletedTransactions += deletedTx.length

    if (ids.length < 200) break
  }

  return { deletedTransactions, deletedRechargeOrders, cutoffIso }
}
