import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
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
    await supabaseRest(`transactions?id=eq.${enc(input.transactionId)}&user_id=is.null`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId }),
    }).catch(() => {})
    await supabaseRest(`recharge_orders?transaction_id=eq.${enc(input.transactionId)}&user_id=is.null`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId }),
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
