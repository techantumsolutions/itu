'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TopupPlanTag = 'popular' | 'none'
export type TopupPlanType = 'topup' | 'unlimited' | 'data'

export type TopupPlan = {
  id: string
  internalPlanId?: string
  systemPlanId?: string
  type: TopupPlanType
  tag: TopupPlanTag
  /** Customer-facing recharge / face value shown on plan cards. */
  recharge_amount: number
  recharge_currency: string
  price_inr: number
  price_eur: number
  validity: string
  data?: string
  calls?: string
  sms?: string
  benefits?: string
  planName?: string
}

export type TopupPricing = {
  localAmount: number
  localCurrency: string
  convertedAmount: number
  convertedCurrency: string
}

type TopupSessionState = {
  countryCode: string
  phoneNumber: string
  operator: string
  selectedPlan: TopupPlan | null
  pricing: TopupPricing | null
  fees: number
  totalAmount: number
  currency: 'INR' | 'EUR'
  orderId: string
  transactionId: string
  providerRef: string
  providerName: string
  rechargeStatus: 'idle' | 'pending' | 'success' | 'failed'
  errorMessage: string
  rewardPointsEarned: number
}

type TopupSessionActions = {
  setPhoneDetails: (payload: { countryCode: string; phoneNumber: string }) => void
  setOperator: (operator: string) => void
  selectPlan: (plan: TopupPlan) => void
  calculatePricing: (payload?: { currency?: 'INR' | 'EUR'; fee?: number }) => void
  setOrderId: (orderId: string) => void
  setTransactionResult: (result: {
    transactionId?: string
    providerRef?: string
    providerName?: string
    rechargeStatus?: 'idle' | 'pending' | 'success' | 'failed'
    errorMessage?: string
    rewardPointsEarned?: number
  }) => void
  resetSession: () => void
}

const initialState: TopupSessionState = {
  countryCode: 'IN',
  phoneNumber: '',
  operator: '',
  selectedPlan: null,
  pricing: null,
  fees: 0,
  totalAmount: 0,
  currency: 'EUR',
  orderId: '',
  transactionId: '',
  providerRef: '',
  providerName: '',
  rechargeStatus: 'idle',
  errorMessage: '',
  rewardPointsEarned: 0,
}

export const useTopupStore = create<TopupSessionState & TopupSessionActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      setPhoneDetails: ({ countryCode, phoneNumber }) =>
        set({
          countryCode: countryCode.toUpperCase(),
          phoneNumber,
        }),
      setOperator: (operator) => set({ operator }),
      selectPlan: (plan) => set({ selectedPlan: plan }),
      calculatePricing: ({ currency, fee } = {}) => {
        const state = get()
        const curr = currency ?? state.currency
        const f = typeof fee === 'number' ? fee : state.fees
        const plan = state.selectedPlan
        if (!plan) {
          set({ pricing: null, totalAmount: 0, fees: f, currency: curr })
          return
        }
        const localAmount = curr === 'INR' ? plan.price_inr : plan.price_eur
        const localCurrency = curr
        // For this flow we keep converted = local (real conversion should be server-side).
        const convertedAmount = localAmount
        const convertedCurrency = localCurrency
        const totalAmount = localAmount + f
        set({
          currency: curr,
          fees: f,
          pricing: { localAmount, localCurrency, convertedAmount, convertedCurrency },
          totalAmount,
        })
      },
      setOrderId: (orderId) => set({ orderId }),
      setTransactionResult: (result) =>
        set({
          transactionId: result.transactionId ?? get().transactionId,
          providerRef: result.providerRef ?? get().providerRef,
          providerName: result.providerName ?? get().providerName,
          rechargeStatus: result.rechargeStatus ?? get().rechargeStatus,
          errorMessage: result.errorMessage ?? get().errorMessage,
          rewardPointsEarned: result.rewardPointsEarned ?? get().rewardPointsEarned,
        }),
      resetSession: () => set({ ...initialState }),
    }),
    {
      name: 'topup-session-v1',
      version: 1,
      partialize: (s) => ({
        countryCode: s.countryCode,
        phoneNumber: s.phoneNumber,
        operator: s.operator,
        selectedPlan: s.selectedPlan,
        pricing: s.pricing,
        fees: s.fees,
        totalAmount: s.totalAmount,
        currency: s.currency,
        orderId: s.orderId,
        transactionId: s.transactionId,
        providerRef: s.providerRef,
        providerName: s.providerName,
        rechargeStatus: s.rechargeStatus,
        errorMessage: s.errorMessage,
        rewardPointsEarned: s.rewardPointsEarned,
      }),
    },
  ),
)

