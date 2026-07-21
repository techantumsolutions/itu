/**
 * @deprecated Import from `@/lib/wallet` — wallet checkout authority lives in the wallet bounded context.
 */
export {
  resolveServerWalletCheckout,
  checkoutPricingFromTxnMeta,
  type WalletCheckoutContext,
  type WalletCheckoutResolveResult,
} from '@/lib/wallet/application/resolve-wallet-checkout'
