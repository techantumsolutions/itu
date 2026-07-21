import { NextResponse } from 'next/server'

/**
 * Legacy amount-based payment session — removed.
 * Razorpay orders must go through prepare-checkout → checkout-price-authority
 * via POST /api/payment/razorpay/create-order (checkoutSessionId required).
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Legacy /api/payment/create-session is disabled. Use /api/topup/prepare-checkout then /api/payment/razorpay/create-order.',
      code: 'LEGACY_CREATE_SESSION_DISABLED',
      redirect: '/api/payment/razorpay/create-order',
    },
    { status: 410 },
  )
}
