import { createRazorpayOrderFromCheckoutSession } from '@/lib/payments/razorpay-create-order'

/**
 * Alias of /api/payment/razorpay/create-order (same handler).
 * Does not compute price independently — requires checkoutSessionId / transactionId.
 */
export async function POST(request: Request) {
  return createRazorpayOrderFromCheckoutSession(request)
}
