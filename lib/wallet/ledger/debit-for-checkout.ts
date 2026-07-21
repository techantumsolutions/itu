/**
 * Authoritative wallet debit for checkout (hybrid Razorpay + wallet-only).
 * DB triggers reject overdraft; callers must abort provider calls on failure.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'

export type WalletCheckoutDebitInput = {
  userId: string
  amountInPayCurrency: number
  payCurrency: string
  walletCurrency: string
  mobileNumber: string
  planId: string
  operatorId: string
  countryId: string
  paymentOrderId: string
  /** Real Razorpay payment id, or 'wallet' for wallet-only. */
  razorpayPaymentId: string
  checkoutSessionId?: string
  /** Label used in exchange-credit description (payment order id or dummy order id). */
  exchangeOrderLabel: string
  /** When same-currency, hide debit from user history (Razorpay hybrid path). */
  hideSameCurrencyDebitFromUser?: boolean
}

export type WalletCheckoutDebitResult =
  | { ok: true }
  | { ok: false; reason: 'INSUFFICIENT_WALLET_BALANCE' | 'DEBIT_FAILED' }

async function convertPayAmountToWalletCurrency(
  amountInPayCurrency: number,
  payCurrency: string,
  walletCurrency: string,
): Promise<number> {
  let walletDeductionAmt = amountInPayCurrency
  const rateRes = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' }).catch(
    () => null,
  )
  if (rateRes?.ok) {
    const data = await rateRes.json()
    const rates = data?.rates
    if (rates && rates[payCurrency] && rates[walletCurrency]) {
      const rateToEUR = 1 / rates[payCurrency]
      const rateFromEUR = rates[walletCurrency]
      walletDeductionAmt = amountInPayCurrency * rateToEUR * rateFromEUR
    }
  }
  return walletDeductionAmt
}

/**
 * Debit wallet for checkout. Cross-currency: debit wallet currency + credit pay currency.
 * Same currency: single payment debit (optionally hidden from user).
 */
export async function debitWalletForCheckout(
  input: WalletCheckoutDebitInput,
): Promise<WalletCheckoutDebitResult> {
  const amount = Number(input.amountInPayCurrency)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: true }
  }

  const payCurrency = String(input.payCurrency || 'INR').toUpperCase()
  const walletCurrency = String(input.walletCurrency || payCurrency).toUpperCase()

  if (walletCurrency !== payCurrency) {
    const walletDeductionAmt = await convertPayAmountToWalletCurrency(
      amount,
      payCurrency,
      walletCurrency,
    )

    const debitRes = await supabaseRest('transactions', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: input.userId,
          type: 'payment',
          amount: walletDeductionAmt,
          currency: walletCurrency,
          status: 'completed',
          description: `Recharge ${input.mobileNumber}`,
          metadata: {
            plan_id: input.planId,
            mobile_number: input.mobileNumber,
            operator_id: input.operatorId,
            country_id: input.countryId,
            payment_order_id: input.paymentOrderId,
            razorpay_payment_id: input.razorpayPaymentId,
            ...(input.checkoutSessionId
              ? { checkout_session_id: input.checkoutSessionId }
              : {}),
          },
        },
      ]),
    }).catch(() => null)

    if (!debitRes || !debitRes.ok) {
      return { ok: false, reason: 'INSUFFICIENT_WALLET_BALANCE' }
    }

    await supabaseRest('transactions', {
      method: 'POST',
      body: JSON.stringify([
        {
          user_id: input.userId,
          type: 'topup',
          amount,
          currency: payCurrency,
          status: 'completed',
          description: `Exchange credit from ${walletCurrency} wallet for order ${input.exchangeOrderLabel}`,
          metadata: {
            hide_from_user: true,
          },
        },
      ]),
    }).catch((err) => console.error('Failed to insert exchange credit transaction:', err))

    return { ok: true }
  }

  const debitRes = await supabaseRest('transactions', {
    method: 'POST',
    body: JSON.stringify([
      {
        user_id: input.userId,
        type: 'payment',
        amount,
        currency: walletCurrency,
        status: 'completed',
        description: `Recharge ${input.mobileNumber}`,
        metadata: {
          plan_id: input.planId,
          mobile_number: input.mobileNumber,
          operator_id: input.operatorId,
          country_id: input.countryId,
          payment_order_id: input.paymentOrderId,
          razorpay_payment_id: input.razorpayPaymentId,
          ...(input.hideSameCurrencyDebitFromUser ? { hide_from_user: true } : {}),
          ...(input.checkoutSessionId ? { checkout_session_id: input.checkoutSessionId } : {}),
        },
      },
    ]),
  }).catch(() => null)

  if (!debitRes || !debitRes.ok) {
    return { ok: false, reason: 'INSUFFICIENT_WALLET_BALANCE' }
  }

  return { ok: true }
}
