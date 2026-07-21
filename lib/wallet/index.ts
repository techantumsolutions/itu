/**
 * Wallet bounded context — public API.
 *
 * Payments / admin / routes should import from here (or keep using
 * compatibility shims under lib/payments and lib/admin).
 */

export {
  settleRazorpayPayment,
  type SettleRazorpayPaymentInput,
  type SettleRazorpayPaymentResult,
} from './application/settle-razorpay-payment'

export {
  executeWalletOnlyCheckout,
  type WalletOnlyCheckoutInput,
  type WalletOnlyCheckoutResult,
} from './application/wallet-checkout'

export {
  resolveServerWalletCheckout,
  checkoutPricingFromTxnMeta,
  type WalletCheckoutContext,
  type WalletCheckoutResolveResult,
} from './application/resolve-wallet-checkout'

export {
  claimWalletCheckoutFulfillment,
  releaseWalletCheckoutClaim,
  waitForWalletCheckoutTerminal,
  type WalletCheckoutClaimResult,
  type WalletCheckoutTerminal,
} from './repository/claim-checkout'

export {
  processAdminWalletRefund,
  type WalletRefundResult,
} from './application/process-refund'

export {
  debitWalletForCheckout,
  type WalletCheckoutDebitInput,
  type WalletCheckoutDebitResult,
} from './ledger/debit-for-checkout'

export {
  getUserWalletBalances,
  type UserWalletBalanceResult,
} from './balance/get-user-wallets'
