/**
 * @deprecated Import from `@/lib/wallet` — wallet claim lives in the wallet bounded context.
 */
export {
  claimWalletCheckoutFulfillment,
  releaseWalletCheckoutClaim,
  waitForWalletCheckoutTerminal,
  type WalletCheckoutClaimResult,
  type WalletCheckoutTerminal,
} from '@/lib/wallet/repository/claim-checkout'
