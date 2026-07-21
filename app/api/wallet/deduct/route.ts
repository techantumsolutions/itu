import { NextResponse } from 'next/server'

/**
 * REMOVED: Public wallet debit.
 *
 * Previously any authenticated user could insert
 *   type=recharge, status=completed
 * with a client-chosen amount, which credited/debited wallets via
 * app_update_wallet_balance — bypassing verified payment.
 *
 * Wallet debits are only allowed inside verified checkout:
 *   - POST /api/payment/wallet/checkout
 *   - POST /api/payment/razorpay/verify (hybrid wallet portion)
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Wallet deduct is disabled. Debits only occur through verified payment checkout.',
      code: 'WALLET_DEDUCT_REMOVED',
    },
    { status: 410 },
  )
}

export async function GET() {
  return POST()
}
