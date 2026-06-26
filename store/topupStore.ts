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
  /** Recharge currency of the selected plan (e.g. INR, USD, XCD). */
  currency: string
  /** System operator UUID used for routing/LCR. */
  operatorProviderId: string
  checkoutSessionId: string
  rechargeAttemptId: string
  selectedProviderName: string
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
  calculatePricing: (payload?: { fee?: number }) => void
  setCheckoutSession: (payload: {
    checkoutSessionId: string
    transactionId?: string
    rechargeAttemptId?: string
    selectedProviderName?: string
    operatorProviderId?: string
  }) => void
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
  currency: 'INR',
  operatorProviderId: '',
  checkoutSessionId: '',
  rechargeAttemptId: '',
  selectedProviderName: '',
  orderId: '',
  transactionId: '',
  providerRef: '',
  providerName: '',
  rechargeStatus: 'idle',
  errorMessage: '',
  rewardPointsEarned: 0,
}

type PersistedTopupSession = Pick<
  TopupSessionState,
  | 'countryCode'
  | 'phoneNumber'
  | 'operator'
  | 'operatorProviderId'
  | 'selectedPlan'
  | 'pricing'
  | 'fees'
  | 'totalAmount'
  | 'currency'
  | 'checkoutSessionId'
  | 'rechargeAttemptId'
  | 'selectedProviderName'
  | 'orderId'
  | 'transactionId'
  | 'providerRef'
  | 'providerName'
  | 'rechargeStatus'
  | 'errorMessage'
  | 'rewardPointsEarned'
>

function migratePersistedTopupSession(persistedState: unknown): PersistedTopupSession {
  const state =
    persistedState && typeof persistedState === 'object'
      ? (persistedState as Partial<PersistedTopupSession>)
      : {}

  return {
    countryCode: state.countryCode ?? initialState.countryCode,
    phoneNumber: state.phoneNumber ?? initialState.phoneNumber,
    operator: state.operator ?? initialState.operator,
    operatorProviderId: state.operatorProviderId ?? initialState.operatorProviderId,
    selectedPlan: state.selectedPlan ?? initialState.selectedPlan,
    pricing: state.pricing ?? initialState.pricing,
    fees: state.fees ?? initialState.fees,
    totalAmount: state.totalAmount ?? initialState.totalAmount,
    currency: state.currency ?? initialState.currency,
    checkoutSessionId: state.checkoutSessionId ?? initialState.checkoutSessionId,
    rechargeAttemptId: state.rechargeAttemptId ?? initialState.rechargeAttemptId,
    selectedProviderName: state.selectedProviderName ?? initialState.selectedProviderName,
    orderId: state.orderId ?? initialState.orderId,
    transactionId: state.transactionId ?? initialState.transactionId,
    providerRef: state.providerRef ?? initialState.providerRef,
    providerName: state.providerName ?? initialState.providerName,
    rechargeStatus: state.rechargeStatus ?? initialState.rechargeStatus,
    errorMessage: state.errorMessage ?? initialState.errorMessage,
    rewardPointsEarned: state.rewardPointsEarned ?? initialState.rewardPointsEarned,
  }
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
      calculatePricing: ({ fee } = {}) => {
        const state = get()
        const f = typeof fee === 'number' ? fee : state.fees
        const plan = state.selectedPlan
        if (!plan) {
          set({ pricing: null, totalAmount: 0, fees: f })
          return
        }
        const localCurrency = (plan.recharge_currency || 'INR').trim().toUpperCase()
        const localAmount = Number(plan.recharge_amount) > 0 ? Number(plan.recharge_amount) : 0
        const convertedAmount = localAmount
        const convertedCurrency = localCurrency
        const totalAmount = localAmount + f
        set({
          currency: localCurrency,
          fees: f,
          pricing: { localAmount, localCurrency, convertedAmount, convertedCurrency },
          totalAmount,
        })
      },
      setOrderId: (orderId) => set({ orderId }),
      setCheckoutSession: (payload) =>
        set({
          checkoutSessionId: payload.checkoutSessionId,
          transactionId: payload.transactionId ?? payload.checkoutSessionId,
          rechargeAttemptId: payload.rechargeAttemptId ?? get().rechargeAttemptId,
          selectedProviderName: payload.selectedProviderName ?? get().selectedProviderName,
          providerName: payload.selectedProviderName ?? get().providerName,
          operatorProviderId: payload.operatorProviderId ?? get().operatorProviderId,
        }),
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
      version: 3,
      migrate: (persistedState) => migratePersistedTopupSession(persistedState),
      partialize: (s) => ({
        countryCode: s.countryCode,
        phoneNumber: s.phoneNumber,
        operator: s.operator,
        operatorProviderId: s.operatorProviderId,
        selectedPlan: s.selectedPlan,
        pricing: s.pricing,
        fees: s.fees,
        totalAmount: s.totalAmount,
        currency: s.currency,
        checkoutSessionId: s.checkoutSessionId,
        rechargeAttemptId: s.rechargeAttemptId,
        selectedProviderName: s.selectedProviderName,
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

