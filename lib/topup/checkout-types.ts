export type CheckoutInput = {
  paymentOrderId: string
  planId: string
  systemPlanId?: string
  mobileNumber: string
  operatorId: string
  countryId: string
  amount: number
  currency: string
  razorpayPaymentId: string
  userId?: string
  hideTransactionFromUser?: boolean
  usedWalletBalance?: number
  walletCurrency?: string
  /** Pre-payment checkout session (= pending transaction id). */
  checkoutSessionId?: string
  pendingTransactionId?: string
  serviceFee?: number
  tax?: number
}

export type CheckoutResult = {
  ok: boolean
  transactionId?: string
  rechargeOrderId?: string
  providerRef?: string
  providerName?: string
  providerCode?: string
  status: 'success' | 'failed'
  error?: string
  hints?: string[]
  rewardPointsEarned?: number
}
