'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Transaction, Country, Carrier, Product, RechargeOrder } from './types'

// Auth Store
interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  loginWithOTP: (phone: string, countryCode: string) => Promise<boolean>
  logout: () => void
  register: (email: string, password: string, name: string) => Promise<boolean>
  setSession: (user: User | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null, // Start logged out for public website
      isAuthenticated: false,
      isLoading: false,
      setSession: (user) => set({ user, isAuthenticated: Boolean(user) }),
      login: async (email: string, password: string) => {
        set({ isLoading: true })
        try {
          const normalizedEmail = email.trim().toLowerCase()
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: normalizedEmail, password }),
          })
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; user?: any; error?: string }
          if (!res.ok || !data.ok || !data.user?.id) {
            set({ isLoading: false })
            const err =
              typeof data.error === 'string'
                ? data.error
                : res.status === 401
                  ? 'Invalid email or password.'
                  : 'Login failed. Check server logs and Supabase configuration.'
            return { ok: false, error: err }
          }
          set({ user: data.user, isAuthenticated: true, isLoading: false })
          return { ok: true }
        } catch {
          set({ isLoading: false })
          return { ok: false, error: 'Network error. Is the dev server running?' }
        }
      },
      loginWithOTP: async (phone: string, countryCode: string) => {
        // Deprecated by OTP endpoints; UI calls /api/auth/otp/* directly.
        // Keep for backward compat.
        set({ isLoading: false })
        return false
      },
      logout: () => {
        void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
        set({ user: null, isAuthenticated: false })
        try {
          useAuthStore.persist.clearStorage()
        } catch {
          /* ignore */
        }
      },
      register: async (email: string, _password: string, name: string) => {
        set({ isLoading: true })
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: _password, name }),
          })
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; user?: any }
          if (!res.ok || !data.ok || !data.user?.id) {
            set({ isLoading: false })
            return false
          }
          set({ user: data.user, isAuthenticated: true, isLoading: false })
          return true
        } catch {
          set({ isLoading: false })
          return false
        }
      },
    }),
    {
      name: 'auth-storage',
    }
  )
)

// Wallet Store
interface WalletState {
  balance: number
  transactions: Transaction[]
  isLoading: boolean
  topUp: (amount: number) => Promise<boolean>
  deduct: (amount: number, description: string, metadata?: Transaction['metadata']) => Promise<boolean>
  addRewardPoints: (points: number, orderId: string) => void
  getTransactions: () => Transaction[]
  fetchTransactions: () => Promise<void>
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      balance: 0,
      transactions: [],
      isLoading: false,
      topUp: async (amount: number) => {
        set({ isLoading: true })
        try {
          const res = await fetch('/api/wallet/topup', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount }),
          })
          return res.ok
        } finally {
          set({ isLoading: false })
        }
      },
      deduct: async (amount: number, description: string, metadata?: Transaction['metadata']) => {
        set({ isLoading: true })
        try {
          const res = await fetch('/api/wallet/deduct', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, description, metadata }),
          })
          return res.ok
        } finally {
          set({ isLoading: false })
        }
      },
      addRewardPoints: (points: number, orderId: string) => {
        void fetch('/api/rewards/ledger', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points, orderId }),
        }).catch(() => {})
      },
      getTransactions: () => get().transactions,
      fetchTransactions: async () => {
        set({ isLoading: true })
        try {
          const res = await fetch('/api/profile/transactions', { credentials: 'include', cache: 'no-store' })
          if (res.ok) {
            const data = await res.json()
            if (data && Array.isArray(data.transactions)) {
              set({ transactions: data.transactions })
            }
          }
        } catch {
          // ignore
        } finally {
          set({ isLoading: false })
        }
      },
    }),
    {
      name: 'wallet-storage',
    }
  )
)

// Recharge Flow Store
interface RechargeState {
  step: number
  selectedCountry: Country | null
  selectedCarrier: Carrier | null
  selectedProduct: Product | null
  phoneNumber: string
  countries: Country[]
  carriers: Carrier[]
  products: Product[]
  currentOrder: RechargeOrder | null
  isLoadingCarriers: boolean
  isLoadingProducts: boolean
  isProcessing: boolean
  setStep: (step: number) => void
  setCountry: (country: Country | null) => void
  setCarrier: (carrier: Carrier | null) => void
  setProduct: (product: Product | null) => void
  setPhoneNumber: (phone: string) => void
  setCountries: (countries: Country[]) => void
  loadCarriers: (countryCode: string) => Promise<void>
  loadProducts: (carrierId: string) => Promise<void>
  detectCarrier: (phoneNumber: string, countryCode: string) => Promise<Carrier | null>
  processRecharge: () => Promise<RechargeOrder>
  resetRecharge: () => void
}

export const useRechargeStore = create<RechargeState>()((set, get) => ({
  step: 1,
  selectedCountry: null,
  selectedCarrier: null,
  selectedProduct: null,
  phoneNumber: '',
  countries: [],
  carriers: [],
  products: [],
  currentOrder: null,
  isLoadingCarriers: false,
  isLoadingProducts: false,
  isProcessing: false,
  setStep: (step) => set({ step }),
  setCountry: (country) =>
    set({ selectedCountry: country, selectedCarrier: null, selectedProduct: null, carriers: [], products: [] }),
  setCarrier: (carrier) => set({ selectedCarrier: carrier, selectedProduct: null, products: [] }),
  setProduct: (product) => set({ selectedProduct: product }),
  setPhoneNumber: (phone) => set({ phoneNumber: phone }),
  setCountries: (countries) => set({ countries }),
  loadCarriers: async (countryCode) => {
    set({ isLoadingCarriers: true })
    try {
      const res = await fetch(`/api/providers?countryCode=${encodeURIComponent(countryCode)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      set({ carriers: Array.isArray(data.providers) ? data.providers : [], isLoadingCarriers: false })
    } catch {
      set({ carriers: [], isLoadingCarriers: false })
    }
  },
  loadProducts: async (carrierId) => {
    set({ isLoadingProducts: true })
    try {
      const carrier = get().selectedCarrier
      const country = get().selectedCountry
      const params = new URLSearchParams({
        country: country?.code ?? '',
        providerCode: carrier?.code ?? carrierId,
      })
      const res = await fetch(`/api/plans?${params}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      const products = Array.isArray(data.plans)
        ? data.plans.map((p: any): Product => ({
            id: String(p.id),
            skuCode: String(p.id),
            carrierCode: carrier?.code ?? carrierId,
            name: String(p.planName || p.benefits || p.id),
            displayText: String(p.benefits || p.planName || p.id),
            type: p.type === 'data' ? 'data' : p.type === 'unlimited' ? 'voice' : 'combo',
            minSendAmount: Number(p.price_eur ?? p.price_inr ?? 0),
            maxSendAmount: Number(p.price_eur ?? p.price_inr ?? 0),
            sendCurrency: p.price_eur != null ? 'EUR' : 'INR',
            minReceiveAmount: Number(p.price_inr ?? p.price_eur ?? 0),
            maxReceiveAmount: Number(p.price_inr ?? p.price_eur ?? 0),
            receiveCurrency: 'INR',
            commissionRate: 0,
            processingMode: 'Instant',
            benefits: p.benefits ? [{ type: 'benefit', info: String(p.benefits) }] : [],
            validity: p.validity || undefined,
          }))
        : []
      set({ products, isLoadingProducts: false })
    } catch {
      set({ products: [], isLoadingProducts: false })
    }
  },
  detectCarrier: async (phoneNumber: string, countryCode: string) => {
    const res = await fetch('/api/operator/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber, countryCode }),
    })
    const data = await res.json().catch(() => ({}))
    const detected = get().carriers.find((c) => c.code === data.providerCode || c.name === data.operator) ?? null
    if (detected) set({ selectedCarrier: detected })
    return detected
  },
  processRecharge: async () => {
    set({ isProcessing: true })
    const { selectedCountry, selectedCarrier, selectedProduct, phoneNumber } = get()
    try {
      const res = await fetch('/api/recharge', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skuCode: selectedProduct?.skuCode,
          sendAmount: selectedProduct?.minSendAmount,
          phoneNumber,
          countryCode: selectedCountry?.code,
          carrierCode: selectedCarrier?.code,
          carrierName: selectedCarrier?.name,
          productName: selectedProduct?.name,
          receiveCurrency: selectedProduct?.receiveCurrency,
          receiveAmount: selectedProduct?.minReceiveAmount,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.order) throw new Error(data.error ?? 'Recharge failed')
      set({ currentOrder: data.order, isProcessing: false })
      return data.order
    } catch (error) {
      set({ isProcessing: false })
      throw error
    }
  },
  resetRecharge: () =>
    set({
      step: 1,
      selectedCountry: null,
      selectedCarrier: null,
      selectedProduct: null,
      phoneNumber: '',
      carriers: [],
      products: [],
      currentOrder: null,
      isProcessing: false,
    }),
}))

// UI Store
interface UIState {
  sidebarOpen: boolean
  commandOpen: boolean
  setSidebarOpen: (open: boolean) => void
  setCommandOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      commandOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCommandOpen: (open) => set({ commandOpen: open }),
    }),
    {
      name: 'ui-storage',
    }
  )
)

// Public site: region / language / currency (navbar), persisted for return visits
interface LocalePreferencesState {
  regionCode: string
  languageCode: string
  currencyCode: string
  manualOverride: boolean
  setRegion: (code: string) => void
  setLanguage: (code: string) => void
  setCurrency: (code: string) => void
  setManualOverride: (manual: boolean) => void
}

export const useLocalePreferencesStore = create<LocalePreferencesState>()(
  persist(
    (set) => ({
      regionCode: 'IN',
      languageCode: 'en',
      currencyCode: 'USD',
      manualOverride: false,
      setRegion: (code) => set({ regionCode: code }),
      setLanguage: (code) => set({ languageCode: code }),
      setCurrency: (code) => set({ currencyCode: code }),
      setManualOverride: (manual) => set({ manualOverride: manual }),
    }),
    { name: 'itu-locale-prefs' },
  ),
)
