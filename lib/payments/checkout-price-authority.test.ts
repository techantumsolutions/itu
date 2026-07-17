import {
  computeCheckoutPriceAuthority,
  type CheckoutPriceInputs,
} from '@/lib/payments/checkout-price-authority'

/** EUR-base cross rates (units of currency per 1 EUR). */
const RATES = { INR: 90, USD: 1.1, GBP: 0.85 }

function makeInput(overrides: Partial<CheckoutPriceInputs> = {}): CheckoutPriceInputs {
  return {
    userId: 'user-1',
    payCurrency: 'INR',
    rechargeCurrency: 'INR',
    rechargeTotal: 100,
    requestedWalletAmount: 0,
    walletCurrency: 'INR',
    walletBalance: null,
    maxConsumptionPct: 100,
    requestedRewardPoints: 0,
    pointsBalance: 0,
    minBalanceToRedeem: 0,
    maxRedemptionPct: 50,
    pointEurValue: 0.01,
    rates: null,
    ...overrides,
  }
}

describe('computeCheckoutPriceAuthority', () => {
  it('same currency: reuses the pending amount with no FX', () => {
    const r = computeCheckoutPriceAuthority(makeInput())
    expect(r.validationResult.ok).toBe(true)
    expect(r.payableAmount).toBe(100)
    expect(r.walletCredit).toBe(0)
    expect(r.rewardCredit).toBe(0)
    expect(r.rewardPoints).toBe(0)
    expect(r.razorpayCharge).toBe(100)
  })

  it('cross currency: converts the authoritative total with server rates', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({ payCurrency: 'USD', rechargeCurrency: 'INR', rechargeTotal: 900, rates: RATES }),
    )
    expect(r.validationResult.ok).toBe(true)
    // 900 INR * (1.1 / 90) = 11 USD
    expect(r.payableAmount).toBeCloseTo(11, 2)
    expect(r.razorpayCharge).toBeCloseTo(11, 2)
  })

  it('wallet only: full wallet coverage drives the Razorpay charge to zero', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({ requestedWalletAmount: 100, walletCurrency: 'INR', walletBalance: 200 }),
    )
    expect(r.validationResult.ok).toBe(true)
    expect(r.walletCredit).toBe(100)
    expect(r.rewardCredit).toBe(0)
    expect(r.razorpayCharge).toBe(0)
  })

  it('reward only: values points server-side and reduces the charge', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({
        payCurrency: 'EUR',
        rechargeCurrency: 'EUR',
        rechargeTotal: 20,
        requestedRewardPoints: 500,
        pointsBalance: 1000,
        pointEurValue: 0.01,
        maxRedemptionPct: 50,
      }),
    )
    expect(r.validationResult.ok).toBe(true)
    expect(r.rewardPoints).toBe(500)
    expect(r.rewardCredit).toBeCloseTo(5, 2) // 500 * 0.01 EUR
    expect(r.walletCredit).toBe(0)
    expect(r.razorpayCharge).toBeCloseTo(15, 2)
  })

  it('wallet + reward: both apply and split the payable', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({
        payCurrency: 'EUR',
        rechargeCurrency: 'EUR',
        rechargeTotal: 100,
        requestedWalletAmount: 30,
        walletCurrency: 'EUR',
        walletBalance: 50,
        maxConsumptionPct: 100,
        requestedRewardPoints: 200,
        pointsBalance: 1000,
        pointEurValue: 0.05,
        maxRedemptionPct: 50,
      }),
    )
    expect(r.validationResult.ok).toBe(true)
    expect(r.walletCredit).toBe(30)
    expect(r.rewardCredit).toBeCloseTo(10, 2) // 200 * 0.05 EUR
    expect(r.rewardPoints).toBe(200)
    expect(r.razorpayCharge).toBeCloseTo(60, 2)
  })

  it('wallet exceeds balance: rejected', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({ requestedWalletAmount: 100, walletCurrency: 'INR', walletBalance: 50 }),
    )
    const v = r.validationResult
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.status).toBe(400)
      expect(v.error).toMatch(/insufficient wallet/i)
    }
  })

  it('reward exceeds balance: rejected', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({
        payCurrency: 'EUR',
        rechargeCurrency: 'EUR',
        requestedRewardPoints: 2000,
        pointsBalance: 1000,
      }),
    )
    const v = r.validationResult
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.status).toBe(400)
      expect(v.error).toMatch(/insufficient reward points/i)
    }
  })

  it('max wallet percentage: rejected above the consumption cap', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({
        requestedWalletAmount: 60,
        walletCurrency: 'INR',
        walletBalance: 100,
        maxConsumptionPct: 50,
      }),
    )
    const v = r.validationResult
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.status).toBe(400)
      expect(v.error).toMatch(/maximum wallet consumption/i)
    }
  })

  it('max reward percentage: rejected above the redemption cap', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({
        payCurrency: 'EUR',
        rechargeCurrency: 'EUR',
        requestedRewardPoints: 600,
        pointsBalance: 1000,
        maxRedemptionPct: 50,
        pointEurValue: 0.01,
      }),
    )
    const v = r.validationResult
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.status).toBe(400)
      expect(v.error).toMatch(/maximum reward points redemption/i)
    }
  })

  describe('guest user', () => {
    it('rejects wallet use without authentication', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({ userId: null, requestedWalletAmount: 10, walletBalance: 100 }),
      )
      const v = r.validationResult
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.status).toBe(401)
        expect(v.error).toMatch(/wallet payment requires an authenticated user/i)
      }
    })

    it('rejects reward use without authentication', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({
          userId: null,
          payCurrency: 'EUR',
          rechargeCurrency: 'EUR',
          requestedRewardPoints: 100,
          pointsBalance: 1000,
        }),
      )
      const v = r.validationResult
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.status).toBe(401)
        expect(v.error).toMatch(/reward redemption requires an authenticated user/i)
      }
    })

    it('allows a full card payment (no wallet / no rewards)', () => {
      const r = computeCheckoutPriceAuthority(makeInput({ userId: null }))
      expect(r.validationResult.ok).toBe(true)
      expect(r.razorpayCharge).toBe(100)
    })
  })

  it('zero wallet: no wallet validation, charge unaffected', () => {
    const r = computeCheckoutPriceAuthority(makeInput({ requestedWalletAmount: 0, walletBalance: null }))
    expect(r.validationResult.ok).toBe(true)
    expect(r.walletCredit).toBe(0)
    expect(r.razorpayCharge).toBe(100)
  })

  it('zero reward: no reward validation, charge unaffected', () => {
    const r = computeCheckoutPriceAuthority(makeInput({ requestedRewardPoints: 0 }))
    expect(r.validationResult.ok).toBe(true)
    expect(r.rewardCredit).toBe(0)
    expect(r.rewardPoints).toBe(0)
    expect(r.razorpayCharge).toBe(100)
  })

  it('minimum Razorpay amount: pure fn computes a sub-minimum charge (route enforces the minimum)', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({ requestedWalletAmount: 99.5, walletCurrency: 'INR', walletBalance: 100 }),
    )
    expect(r.validationResult.ok).toBe(true)
    expect(r.walletCredit).toBe(99.5)
    expect(r.razorpayCharge).toBe(0.5)
  })

  describe('floating-point rounding', () => {
    it('rounds the charge to the currency minor unit (0.3 - 0.1 = 0.2)', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({
          payCurrency: 'USD',
          rechargeCurrency: 'USD',
          rechargeTotal: 0.3,
          requestedWalletAmount: 0.1,
          walletCurrency: 'USD',
          walletBalance: 1,
        }),
      )
      expect(r.validationResult.ok).toBe(true)
      expect(r.payableAmount).toBe(0.3)
      expect(r.walletCredit).toBe(0.1)
      expect(r.razorpayCharge).toBe(0.2)
    })

    it('rounds a repeating cross-currency conversion to 2 decimals', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({
          payCurrency: 'USD',
          rechargeCurrency: 'INR',
          rechargeTotal: 10,
          rates: { INR: 83, USD: 1 },
        }),
      )
      expect(r.validationResult.ok).toBe(true)
      // 10 / 83 = 0.12048... -> 0.12
      expect(r.payableAmount).toBe(0.12)
    })
  })

  describe('negative values', () => {
    it('rejects a negative pending total', () => {
      const r = computeCheckoutPriceAuthority(makeInput({ rechargeTotal: -100 }))
      const v = r.validationResult
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.status).toBe(400)
        expect(v.error).toMatch(/invalid or missing pending checkout amount/i)
      }
    })

    it('ignores a negative wallet amount (treated as no wallet)', () => {
      const r = computeCheckoutPriceAuthority(makeInput({ requestedWalletAmount: -50 }))
      expect(r.validationResult.ok).toBe(true)
      expect(r.walletCredit).toBe(0)
      expect(r.razorpayCharge).toBe(100)
    })

    it('ignores negative reward points (treated as no rewards)', () => {
      const r = computeCheckoutPriceAuthority(makeInput({ requestedRewardPoints: -10 }))
      expect(r.validationResult.ok).toBe(true)
      expect(r.rewardPoints).toBe(0)
      expect(r.rewardCredit).toBe(0)
    })
  })

  describe('null / NaN values', () => {
    it('rejects a NaN pending total', () => {
      const r = computeCheckoutPriceAuthority(makeInput({ rechargeTotal: Number.NaN }))
      expect(r.validationResult.ok).toBe(false)
    })

    it('rejects wallet use when the balance is null', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({ requestedWalletAmount: 100, walletCurrency: 'INR', walletBalance: null }),
      )
      const v = r.validationResult
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.status).toBe(400)
        expect(v.error).toMatch(/insufficient wallet/i)
      }
    })

    it('rejects cross-currency when rates are null', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({ payCurrency: 'USD', rechargeCurrency: 'INR', rechargeTotal: 900, rates: null }),
      )
      const v = r.validationResult
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.status).toBe(400)
        expect(v.error).toMatch(/unable to determine payable amount/i)
      }
    })
  })

  it('invalid currency: unknown pay currency without a rate is rejected', () => {
    const r = computeCheckoutPriceAuthority(
      makeInput({ payCurrency: 'ZZZ', rechargeCurrency: 'INR', rechargeTotal: 900, rates: RATES }),
    )
    const v = r.validationResult
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.status).toBe(400)
      expect(v.error).toMatch(/unable to determine payable amount/i)
    }
  })

  describe('invalid FX rate', () => {
    it('rejects a zero source rate for the payable conversion', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({
          payCurrency: 'USD',
          rechargeCurrency: 'INR',
          rechargeTotal: 900,
          rates: { INR: 0, USD: 1.1 },
        }),
      )
      expect(r.validationResult.ok).toBe(false)
    })

    it('rejects when the wallet-currency rate is missing', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({
          payCurrency: 'INR',
          rechargeCurrency: 'INR',
          rechargeTotal: 100,
          requestedWalletAmount: 10,
          walletCurrency: 'USD',
          walletBalance: 100,
          rates: { INR: 90 },
        }),
      )
      const v = r.validationResult
      expect(v.ok).toBe(false)
      if (!v.ok) {
        expect(v.error).toMatch(/unable to validate wallet balance/i)
      }
    })
  })

  describe('exact boundary values', () => {
    it('wallet exactly equal to balance and cap is accepted', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({ requestedWalletAmount: 100, walletCurrency: 'INR', walletBalance: 100, maxConsumptionPct: 100 }),
      )
      expect(r.validationResult.ok).toBe(true)
      expect(r.walletCredit).toBe(100)
      expect(r.razorpayCharge).toBe(0)
    })

    it('wallet exactly equal to the consumption cap is accepted', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({ requestedWalletAmount: 50, walletCurrency: 'INR', walletBalance: 100, maxConsumptionPct: 50 }),
      )
      expect(r.validationResult.ok).toBe(true)
      expect(r.walletCredit).toBe(50)
      expect(r.razorpayCharge).toBe(50)
    })

    it('reward exactly at the redemption cap is accepted', () => {
      const r = computeCheckoutPriceAuthority(
        makeInput({
          payCurrency: 'EUR',
          rechargeCurrency: 'EUR',
          rechargeTotal: 100,
          requestedRewardPoints: 500,
          pointsBalance: 1000,
          maxRedemptionPct: 50,
          pointEurValue: 0.01,
        }),
      )
      expect(r.validationResult.ok).toBe(true)
      expect(r.rewardPoints).toBe(500)
      expect(r.rewardCredit).toBeCloseTo(5, 2)
      expect(r.razorpayCharge).toBeCloseTo(95, 2)
    })
  })
})
