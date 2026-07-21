import {
  assertPaymentOrderIsActiveForSession,
  paymentOrderMatchesAuthority,
} from '@/lib/payments/active-payment-order'

describe('paymentOrderMatchesAuthority', () => {
  const base = {
    id: 'po-1',
    order_id: 'order_1',
    status: 'pending_payment',
    amount: 100,
    currency: 'INR',
    metadata: {
      used_wallet_balance: 20,
      used_reward_points: 5,
      wallet_currency: 'INR',
      payable_amount: 120,
      razorpay_amount: 10000,
    },
  }

  it('matches identical authority', () => {
    expect(
      paymentOrderMatchesAuthority(
        base,
        {
          razorpayCharge: 100,
          payableAmount: 120,
          walletCredit: 20,
          rewardPoints: 5,
          walletCurrency: 'INR',
        },
        'INR',
      ),
    ).toBe(true)
  })

  it('rejects different razorpay charge', () => {
    expect(
      paymentOrderMatchesAuthority(
        base,
        {
          razorpayCharge: 90,
          payableAmount: 120,
          walletCredit: 20,
          rewardPoints: 5,
          walletCurrency: 'INR',
        },
        'INR',
      ),
    ).toBe(false)
  })
})

describe('assertPaymentOrderIsActiveForSession', () => {
  it('allows already-paid orders (idempotent verify)', async () => {
    const result = await assertPaymentOrderIsActiveForSession({
      paymentOrderId: 'po-1',
      checkoutSessionId: 'sess-1',
      status: 'paid',
    })
    expect(result).toEqual({ ok: true })
  })

  it('rejects failed/superseded orders', async () => {
    const result = await assertPaymentOrderIsActiveForSession({
      paymentOrderId: 'po-1',
      checkoutSessionId: 'sess-1',
      status: 'failed',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('PAYMENT_ORDER_SUPERSEDED')
    }
  })
})
