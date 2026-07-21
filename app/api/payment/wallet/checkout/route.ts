import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { executeWalletOnlyCheckout } from '@/lib/wallet/application/wallet-checkout'

/**
 * Wallet-only checkout HTTP adapter.
 * Accepts transactionId only; orchestration lives in lib/wallet.
 */
export async function POST(request: Request) {
  const user = await getRequestUser(request)
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const transactionId =
      (typeof body.transactionId === 'string' && body.transactionId.trim()) ||
      (typeof body.checkoutSessionId === 'string' && body.checkoutSessionId.trim()) ||
      ''

    const result = await executeWalletOnlyCheckout({
      userId: user.id,
      transactionId,
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error('Wallet checkout processing failed:', error)
    return NextResponse.json({ error: 'Wallet checkout failed' }, { status: 500 })
  }
}
