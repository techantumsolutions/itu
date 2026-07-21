/**
 * Application service: wallet-only checkout orchestration.
 * HTTP adapters authenticate and map the result to NextResponse.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'
import { executeCheckout } from '@/lib/topup/checkout-service'
import { linkPaymentOrderToCheckoutSession } from '@/lib/checkout/link-payment-order'
import { redeemPoints } from '@/lib/rewards/reward-service'
import { attachUserIdToCheckoutRecords } from '@/lib/checkout/attach-checkout-user'
import {
  checkoutPricingFromTxnMeta,
  resolveServerWalletCheckout,
} from '@/lib/wallet/application/resolve-wallet-checkout'
import {
  claimWalletCheckoutFulfillment,
  releaseWalletCheckoutClaim,
  waitForWalletCheckoutTerminal,
} from '@/lib/wallet/repository/claim-checkout'
import {
  expireActivePaymentOrdersForSession,
  insertPaymentOrder,
} from '@/lib/payments/active-payment-order'
import { debitWalletForCheckout } from '@/lib/wallet/ledger/debit-for-checkout'

export type WalletOnlyCheckoutInput = {
  userId: string
  transactionId: string
}

export type WalletOnlyCheckoutResult = {
  body: Record<string, unknown>
  status: number
}

function terminalSuccess(st: string, rs: string): boolean {
  return st === 'completed' || rs === 'success' || rs === 'completed'
}

function terminalFailed(st: string, rs: string): boolean {
  return st === 'failed' || rs === 'failed'
}

export async function executeWalletOnlyCheckout(
  input: WalletOnlyCheckoutInput,
): Promise<WalletOnlyCheckoutResult> {
  const transactionId = input.transactionId.trim()
  if (!transactionId) {
    return { body: { error: 'transactionId is required' }, status: 400 }
  }

  const resolved = await resolveServerWalletCheckout({
    userId: input.userId,
    transactionId,
  })
  if (!resolved.ok) {
    if (resolved.status === 400 && /not awaiting payment/i.test(resolved.error)) {
      const terminal = await waitForWalletCheckoutTerminal(transactionId)
      if (terminal) {
        const st = terminal.transactionStatus.toLowerCase()
        const rs = String(terminal.rechargeStatus ?? '').toLowerCase()
        const success = terminalSuccess(st, rs)
        if (success || terminalFailed(st, rs)) {
          return {
            body: {
              ok: success,
              idempotent: true,
              transactionId: terminal.transactionId,
              rechargeOrderId: terminal.rechargeOrderId,
              providerRef: terminal.providerRef,
              providerName: terminal.providerName,
              status: success ? 'success' : 'failed',
              error: success ? undefined : terminal.error || resolved.error,
            },
            status: 200,
          }
        }
        return {
          body: {
            ok: false,
            idempotent: true,
            transactionId,
            status: 'processing',
            error: 'Checkout is already in progress',
            code: 'CHECKOUT_IN_PROGRESS',
          },
          status: 202,
        }
      }
    }
    return { body: { error: resolved.error }, status: resolved.status }
  }

  const { ctx } = resolved
  const {
    planId,
    systemPlanId,
    mobileNumber,
    operatorId,
    countryId,
    payCurrency: currency,
    walletCurrency,
    authority,
    txnMeta,
  } = ctx

  const payableAmount = authority.payableAmount
  const adjustedAmount = authority.walletCredit
  const serverRewardPoints = authority.rewardPoints
  const pointsWorthInPayCurrency = authority.rewardCredit

  await attachUserIdToCheckoutRecords({
    userId: input.userId,
    transactionId,
  })

  const claim = await claimWalletCheckoutFulfillment(transactionId)
  if (!claim.ok) {
    return { body: { error: claim.error }, status: claim.status }
  }

  if (!claim.claimed) {
    const terminal = await waitForWalletCheckoutTerminal(transactionId)
    if (terminal) {
      const st = terminal.transactionStatus.toLowerCase()
      const rs = String(terminal.rechargeStatus ?? '').toLowerCase()
      const success = terminalSuccess(st, rs)
      if (success || terminalFailed(st, rs)) {
        return {
          body: {
            ok: success,
            idempotent: true,
            transactionId: terminal.transactionId,
            rechargeOrderId: terminal.rechargeOrderId,
            providerRef: terminal.providerRef,
            providerName: terminal.providerName,
            status: success ? 'success' : 'failed',
            error: success ? undefined : terminal.error || 'Checkout already finished',
            payableAmount,
            walletCredit: adjustedAmount,
            rewardPoints: serverRewardPoints,
          },
          status: 200,
        }
      }
    }
    return {
      body: {
        ok: false,
        idempotent: true,
        transactionId,
        status: 'processing',
        error: 'Checkout is already in progress',
        code: 'CHECKOUT_IN_PROGRESS',
        currentStatus: claim.currentStatus,
      },
      status: 202,
    }
  }

  await expireActivePaymentOrdersForSession(transactionId)

  const dummyOrderId = `wallet-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  const inserted = await insertPaymentOrder({
    order_id: dummyOrderId,
    plan_id: planId,
    mobile_number: mobileNumber,
    operator_id: operatorId,
    country_id: countryId,
    amount: 0,
    currency,
    status: 'paid',
    user_id: input.userId,
    checkout_session_id: transactionId,
    pending_transaction_id: transactionId,
    metadata: {
      is_wallet_only: true,
      wallet_deduction: adjustedAmount,
      wallet_currency: walletCurrency,
      used_reward_points: serverRewardPoints,
      reward_points_deduction_amount: pointsWorthInPayCurrency,
      payable_amount: payableAmount,
      pricing_source: 'server',
    },
  })

  const paymentOrderId = inserted.ok ? inserted.id : ''
  if (!paymentOrderId) {
    await releaseWalletCheckoutClaim(transactionId)
    return { body: { error: 'Failed to record checkout order' }, status: 500 }
  }

  await linkPaymentOrderToCheckoutSession({
    paymentOrderId,
    checkoutSessionId: transactionId,
    transactionId,
    rechargeAttemptId:
      typeof txnMeta.recharge_attempt_id === 'string' ? txnMeta.recharge_attempt_id : undefined,
    selectedProviderId:
      typeof txnMeta.selected_provider_id === 'string' ? txnMeta.selected_provider_id : undefined,
    selectedProviderName:
      typeof txnMeta.selected_provider_name === 'string'
        ? txnMeta.selected_provider_name
        : undefined,
    selectedProviderPlanId:
      typeof txnMeta.selected_provider_plan_id === 'string'
        ? txnMeta.selected_provider_plan_id
        : undefined,
    selectedProviderCost:
      typeof txnMeta.selected_provider_cost === 'number' ? txnMeta.selected_provider_cost : null,
    selectedProviderCurrency:
      typeof txnMeta.selected_provider_currency === 'string'
        ? txnMeta.selected_provider_currency
        : null,
    routingResult: txnMeta.routing_result,
    lcrResult: txnMeta.lcr_result,
    providerSelectionTimestamp:
      typeof txnMeta.provider_selection_timestamp === 'string'
        ? txnMeta.provider_selection_timestamp
        : undefined,
    totalPayable: payableAmount,
    paymentCurrency: currency,
    checkoutPricing: checkoutPricingFromTxnMeta(txnMeta),
  })

  console.log('[PAYMENT LOG] wallet payment initiated (claim winner)', {
    paymentOrderId,
    transactionId,
    payableAmount,
    currency,
    adjustedAmount,
    serverRewardPoints,
  })

  if (adjustedAmount > 0) {
    const debit = await debitWalletForCheckout({
      userId: input.userId,
      amountInPayCurrency: adjustedAmount,
      payCurrency: currency,
      walletCurrency,
      mobileNumber,
      planId,
      operatorId,
      countryId,
      paymentOrderId,
      razorpayPaymentId: 'wallet',
      checkoutSessionId: transactionId,
      exchangeOrderLabel: dummyOrderId,
      hideSameCurrencyDebitFromUser: true,
    })
    if (!debit.ok) {
      await supabaseRest(`payment_orders?id=eq.${encodeURIComponent(paymentOrderId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'failed' }),
      }).catch(() => {})
      await releaseWalletCheckoutClaim(transactionId)
      return { body: { error: 'Insufficient wallet balance' }, status: 400 }
    }
  }

  const result = await executeCheckout({
    paymentOrderId,
    planId,
    systemPlanId,
    mobileNumber,
    operatorId,
    countryId,
    amount: payableAmount,
    currency,
    razorpayPaymentId: `wallet-${paymentOrderId}`,
    userId: input.userId,
    hideTransactionFromUser: walletCurrency !== currency,
    usedWalletBalance: adjustedAmount,
    walletCurrency,
    checkoutSessionId: transactionId,
    pendingTransactionId: transactionId,
  })

  if (result.ok && serverRewardPoints > 0) {
    const pointsResult = await redeemPoints(
      input.userId,
      result.transactionId || transactionId || null,
      serverRewardPoints,
      `Redeemed on recharge ${mobileNumber}`,
    )
    if (!pointsResult) {
      console.error('[REWARDS] Failed to deduct user points after successful wallet checkout')
    }
  }

  return {
    body: {
      ok: result.ok,
      idempotent: false,
      transactionId: result.transactionId,
      rechargeOrderId: result.rechargeOrderId,
      providerRef: result.providerRef,
      providerName: result.providerName,
      status: result.status,
      error: result.error,
      rewardPointsEarned: result.rewardPointsEarned ?? 0,
      payableAmount,
      walletCredit: adjustedAmount,
      rewardPoints: serverRewardPoints,
    },
    status: 200,
  }
}
