import { createRazorpayOrderFromCheckoutSession } from '@/lib/payments/razorpay-create-order'

/** Canonical Razorpay create-order — amount from checkout-price-authority only. */
export async function POST(request: Request) {
  return createRazorpayOrderFromCheckoutSession(request)
}
