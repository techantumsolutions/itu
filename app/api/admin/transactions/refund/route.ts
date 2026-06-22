import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function POST(request: Request) {
  // 1. Authenticate request and check permissions
  if (!(await adminCanUseFeature(request, 'transactions', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { transactionId } = await request.json().catch(() => ({}))
    if (!transactionId) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
    }

    // 2. Fetch the transaction details
    const txRes = await supabaseRest(`transactions?id=eq.${encodeURIComponent(transactionId)}&select=id,user_id,type,amount,currency,status,description`, {
      cache: 'no-store',
    })

    if (!txRes.ok) {
      return NextResponse.json({ error: 'Failed to retrieve transaction' }, { status: 500 })
    }

    const txs = await txRes.json() as any[]
    if (txs.length === 0) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const transaction = txs[0]

    // 3. Verify eligibility
    if (transaction.type !== 'recharge') {
      return NextResponse.json({ error: 'Only recharge transactions can be refunded' }, { status: 400 })
    }

    if (transaction.status === 'refunded') {
      return NextResponse.json({ error: 'Transaction has already been refunded' }, { status: 400 })
    }

    if (transaction.status !== 'failed') {
      return NextResponse.json({ error: 'Only failed recharge transactions can be refunded' }, { status: 400 })
    }

    if (!transaction.user_id) {
      return NextResponse.json({ error: 'Transaction is not linked to a user profile' }, { status: 400 })
    }

    // 4. Perform the refund operation:
    // Update original transaction status to refunded
    const updateTxRes = await supabaseRest(`transactions?id=eq.${encodeURIComponent(transactionId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'refunded' }),
    })

    if (!updateTxRes.ok) {
      return NextResponse.json({ error: 'Failed to update original transaction status' }, { status: 500 })
    }

    // Update associated recharge orders status to refunded
    await supabaseRest(`recharge_orders?transaction_id=eq.${encodeURIComponent(transactionId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'refunded' }),
    }).catch((err) => {
      console.error('Failed to update recharge orders status:', err)
    })

    // Insert new refund transaction (which triggers the database trigger to credit the wallet)
    const refundTxRes = await supabaseRest('transactions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          user_id: transaction.user_id,
          type: 'refund',
          amount: Number(transaction.amount),
          currency: transaction.currency,
          status: 'completed',
          description: `Refund for failed recharge (Tx ID: ${transactionId})`,
        },
      ]),
    })

    if (!refundTxRes.ok) {
      console.error('Failed to create refund transaction:', await refundTxRes.text())
      // We do not roll back the original status update here as Postgres is not transactional across separate REST calls,
      // but in standard operation this should succeed.
      return NextResponse.json({ error: 'Refund transaction failed to persist' }, { status: 500 })
    }

    const createdRefundTxs = await refundTxRes.json()
    const refundTxId = createdRefundTxs?.[0]?.id

    // Insert into refunds table to maintain all the refund details in a separate table
    const refundDetailsRes = await supabaseRest('refunds', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([
        {
          transaction_id: transactionId,
          amount: Number(transaction.amount),
          currency: transaction.currency,
          status: 'completed',
          reason: `Refund for failed recharge (Tx ID: ${transactionId})`,
          metadata: {
            refund_transaction_id: refundTxId,
            refund_type: 'wallet',
          },
        },
      ]),
    })

    if (!refundDetailsRes.ok) {
      console.error('Failed to create record in refunds table:', await refundDetailsRes.text())
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Refund processing error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
