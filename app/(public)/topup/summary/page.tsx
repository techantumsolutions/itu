'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useTopupStore } from '@/store/topupStore'
import { useAuthStore } from '@/lib/stores'
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, Loader2, LogIn, Shield, Smartphone } from 'lucide-react'

import {
  buildPayableCurrencyOptions,
  convertUsingEurBaseRates,
  crossRateUsingEurBase,
  formatMoney,
  normalizeCurrencyCode,
} from '@/lib/topup/currency-conversion'
import { formatPlanRechargeValue } from '@/lib/catalog/plan-recharge-value'
import { buildInternationalMobile, getDialCode } from '@/lib/lcr/countries'
import {
  computeRechargeProcessingFeeAmount,
  DEFAULT_RECHARGE_PROCESSING_FEES,
  parseRechargeProcessingFees,
  type RechargeProcessingFees,
} from '@/lib/settings/recharge-processing-fees'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { countriesList, getFlagEmoji, isValidPhoneNumber } from '@/lib/country-codes'
import { getCountryCallingCode } from 'libphonenumber-js'
import { useFingerprint } from '@/hooks/use-fingerprint'

declare global {
  interface Window {
    Razorpay?: any
  }
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

/* ------------------------------------------------------------------ */
/*  Inline Login Dialog (OTP guest + Email/Password registered)       */
/* ------------------------------------------------------------------ */
function InlineLoginDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultPhone,
  countryIso,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
  defaultPhone: string
  countryIso: string
}) {
  const dialPrefix = getDialCode(countryIso)
  const { login, setSession } = useAuthStore()
  const fingerprint = useFingerprint()
  const [tab, setTab] = useState<'mobile' | 'email'>('mobile')

  // --- Mobile OTP state ---
  const [phone, setPhone] = useState('')
  const [otpStep, setOtpStep] = useState<'phone' | 'otp'>('phone')
  const [otpValue, setOtpValue] = useState('')
  const [otpTimer, setOtpTimer] = useState(0)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [devOtp, setDevOtp] = useState('')

  // --- Dynamic Country Code Select state ---
  const [selectedCountryCode, setSelectedCountryCode] = useState(countryIso)
  const [selectedDialCode, setSelectedDialCode] = useState(dialPrefix)
  const [openCountry, setOpenCountry] = useState(false)

  useEffect(() => {
    if (countryIso) {
      setSelectedCountryCode(countryIso)
      try {
        setSelectedDialCode(getCountryCallingCode(countryIso as any))
      } catch {
        setSelectedDialCode(dialPrefix)
      }
    }
  }, [countryIso, dialPrefix])

  // --- Email state ---
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)

  // --- Email 2FA state ---
  const [requires2FA, setRequires2FA] = useState(false)
  const [tempToken, setTempToken] = useState('')
  const [emailOtpValue, setEmailOtpValue] = useState('')
  const [emailOtpTimer, setEmailOtpTimer] = useState(0)
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false)
  const [devEmailOtp, setDevEmailOtp] = useState('')

  const [err, setErr] = useState('')

  // OTP countdown
  useEffect(() => {
    if (otpTimer <= 0) return
    const t = setInterval(() => setOtpTimer((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [otpTimer])

  // Email OTP countdown
  useEffect(() => {
    if (emailOtpTimer <= 0) return
    const t = setInterval(() => setEmailOtpTimer((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [emailOtpTimer])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setErr('')
      setOtpStep('phone')
      setOtpValue('')
      setPhone('')
      setDevOtp('')
      setRequires2FA(false)
      setTempToken('')
      setEmailOtpValue('')
      setDevEmailOtp('')
    }
  }, [open])

  const normalizedPhone = phone.replace(/[^\d]/g, '')
  const isValid = useMemo(() => {
    if (!phone) return false
    return isValidPhoneNumber(phone, selectedCountryCode)
  }, [phone, selectedCountryCode])

  const sendOtp = async () => {
    if (!isValid) return
    setSendingOtp(true)
    setErr('')
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+${selectedDialCode}${normalizedPhone}` }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; otp?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to send OTP')
      if (data.otp) {
        setDevOtp(data.otp)
      } else {
        setDevOtp('')
      }
      setOtpValue('')
      setOtpTimer(30)
      setOtpStep('otp')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send OTP')
    } finally {
      setSendingOtp(false)
    }
  }

  const verifyOtp = async () => {
    if (otpValue.length !== 6) return
    setVerifyingOtp(true)
    setErr('')
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+${selectedDialCode}${normalizedPhone}`, otp: otpValue }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'OTP verification failed')

      // Fetch session
      const me = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      const meData = (await me.json().catch(() => ({}))) as { user?: any }
      if (meData?.user?.id) setSession(meData.user)

      onOpenChange(false)
      onSuccess()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'OTP verification failed')
    } finally {
      setVerifyingOtp(false)
    }
  }

  const loginEmail = async () => {
    if (!email || !password) return
    setEmailLoading(true)
    setErr('')
    const result = await login(email, password, fingerprint || undefined)
    setEmailLoading(false)
    if (result.ok) {
      if (result.requires_2fa) {
        setRequires2FA(true)
        setTempToken(result.temp_token || '')
        setDevEmailOtp(result.otp || '')
        setEmailOtpValue('')
        setEmailOtpTimer(25)
      } else {
        onOpenChange(false)
        onSuccess()
      }
    } else {
      setErr(result.error ?? 'Invalid email or password')
    }
  }

  const verifyEmailOtp = async () => {
    if (emailOtpValue.length !== 6) return
    setVerifyingEmailOtp(true)
    setErr('')
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temp_token: tempToken, code: emailOtpValue }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; user?: any }
      if (!res.ok || !data.ok) throw new Error(data.error || '2FA verification failed')
      if (data.user?.id) setSession(data.user)

      onOpenChange(false)
      onSuccess()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid 2FA code')
    } finally {
      setVerifyingEmailOtp(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Log in to continue</DialogTitle>
          <DialogDescription>Sign in to complete your recharge payment</DialogDescription>
        </DialogHeader>

        {err ? <div className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{err}</div> : null}

        <Tabs value={tab} onValueChange={(v) => { setTab(v as 'mobile' | 'email'); setErr(''); setRequires2FA(false) }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="mobile">
              <Smartphone className="mr-2 h-4 w-4" />
              Mobile OTP
            </TabsTrigger>
            <TabsTrigger value="email">
              <LogIn className="mr-2 h-4 w-4" />
              Email &amp; Password
            </TabsTrigger>
          </TabsList>

          {/* ---- Mobile OTP Tab ---- */}
          <TabsContent value="mobile" className="space-y-4 pt-2">
            {otpStep === 'phone' ? (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-neutral-700">Mobile Number</p>
                  <div className="flex items-center gap-2">
                    <Popover open={openCountry} onOpenChange={setOpenCountry}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openCountry}
                          className="flex h-11 items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 shrink-0 min-w-[110px] justify-between"
                        >
                          <span className="truncate">
                            {selectedCountryCode ? `${getFlagEmoji(selectedCountryCode)} +${selectedDialCode}` : `+${selectedDialCode}`}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search country or code..." />
                          <CommandList>
                            <CommandEmpty>No country found.</CommandEmpty>
                            <CommandGroup>
                              {countriesList.map((c) => (
                                <CommandItem
                                  key={c.code}
                                  value={`${c.name} ${c.code} ${c.dialCode}`}
                                  onSelect={() => {
                                    setSelectedDialCode(c.dialCode)
                                    setSelectedCountryCode(c.code)
                                    setOpenCountry(false)
                                  }}
                                  className="flex items-center justify-between py-2 cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">{c.flag}</span>
                                    <span className="font-medium text-neutral-900">{c.name}</span>
                                    <span className="text-neutral-400 font-normal">(+{c.dialCode})</span>
                                  </div>
                                  {selectedCountryCode === c.code && (
                                    <Check className="h-4 w-4 text-[var(--hero-cta-orange)]" />
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="Mobile Number"
                      className="h-11 flex-1"
                      maxLength={15}
                    />
                  </div>
                </div>
                <Button
                  className="h-11 w-full rounded-xl bg-[var(--hero-cta-orange)] font-semibold text-white hover:brightness-105"
                  disabled={sendingOtp || !isValid}
                  onClick={sendOtp}
                >
                  {sendingOtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {sendingOtp ? 'Sending OTP…' : 'Send OTP'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-center text-sm text-neutral-600">
                  Enter the 6-digit code sent to <span className="font-semibold">+{selectedDialCode} {normalizedPhone}</span>
                </p>
                <Input
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  className="h-11 text-center text-lg tracking-[0.3em]"
                  maxLength={6}
                />
                <div className="text-center text-xs text-neutral-500">
                  {otpTimer > 0 ? (
                    <>Resend in <span className="font-semibold text-[var(--hero-cta-orange)]">00:{String(otpTimer).padStart(2, '0')}</span></>
                  ) : (
                    <button type="button" className="font-semibold text-[var(--hero-cta-orange)] hover:underline" onClick={sendOtp}>Resend OTP</button>
                  )}
                </div>
                <Button
                  className="h-11 w-full rounded-xl bg-[var(--hero-cta-orange)] font-semibold text-white hover:brightness-105"
                  disabled={verifyingOtp || otpValue.length !== 6}
                  onClick={verifyOtp}
                >
                  {verifyingOtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {verifyingOtp ? 'Verifying…' : 'Verify & Pay'}
                </Button>
                <Button variant="ghost" className="h-9 w-full text-sm" onClick={() => { setOtpStep('phone'); setOtpValue(''); setErr('') }}>
                  Change number
                </Button>

                {devOtp && (
                  <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-center text-xs font-semibold text-amber-800 border border-amber-200">
                    [Development Mode] Your OTP is: <strong className="text-sm font-bold text-amber-900">{devOtp}</strong>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* ---- Email / Password Tab ---- */}
          <TabsContent value="email" className="space-y-4 pt-2">
            {requires2FA ? (
              <>
                <p className="text-center text-sm text-neutral-600">
                  Enter the 6-digit verification code sent to <span className="font-semibold">{email}</span>
                </p>
                <Input
                  value={emailOtpValue}
                  onChange={(e) => setEmailOtpValue(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="h-11 text-center text-lg tracking-[0.3em]"
                  maxLength={6}
                />
                <div className="text-center text-xs text-neutral-500">
                  {emailOtpTimer > 0 ? (
                    <>Resend in <span className="font-semibold text-[var(--hero-cta-orange)]">00:{String(emailOtpTimer).padStart(2, '0')}</span></>
                  ) : (
                    <button
                      type="button"
                      className="font-semibold text-[var(--hero-cta-orange)] hover:underline"
                      onClick={() => {
                        setRequires2FA(false)
                        setEmailOtpValue('')
                        setErr('Please log in again to receive a new code.')
                      }}
                    >
                      Login again to resend code
                    </button>
                  )}
                </div>
                <Button
                  className="h-11 w-full rounded-xl bg-[var(--hero-cta-orange)] font-semibold text-white hover:brightness-105"
                  disabled={verifyingEmailOtp || emailOtpValue.length !== 6}
                  onClick={verifyEmailOtp}
                >
                  {verifyingEmailOtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {verifyingEmailOtp ? 'Verifying…' : 'Verify & Pay'}
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 w-full text-sm"
                  onClick={() => {
                    setRequires2FA(false)
                    setEmailOtpValue('')
                    setErr('')
                  }}
                >
                  Back to Login
                </Button>

                {devEmailOtp && (
                  <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-center text-xs font-semibold text-amber-800 border border-amber-200">
                    [Development Mode] Your OTP is: <strong className="text-sm font-bold text-amber-900">{devEmailOtp}</strong>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-neutral-700">Email</p>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="h-11"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-neutral-700">Password</p>
                  <div className="relative">
                    <Input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="h-11 pr-10"
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700">
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  className="h-11 w-full rounded-xl bg-[var(--hero-cta-orange)] font-semibold text-white hover:brightness-105"
                  disabled={emailLoading || !email.trim() || !password || !fingerprint}
                  onClick={loginEmail}
                >
                  {emailLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {emailLoading ? 'Logging in…' : 'Log In & Pay'}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Summary Page                                                       */
/* ------------------------------------------------------------------ */
export default function TopupSummaryPage() {
  const router = useRouter()
  const {
    phoneNumber,
    countryCode,
    operator,
    operatorProviderId,
    checkoutSessionId,
    selectedPlan,
    pricing,
    fees,
    totalAmount,
    setTransactionResult,
  } = useTopupStore()
  const { user, isAuthenticated } = useAuthStore()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [payAfterLogin, setPayAfterLogin] = useState(false)

  // Wallet & Currency states
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [walletCurrency, setWalletCurrency] = useState<string | null>(null)
  const [allWallets, setAllWallets] = useState<Array<{ currency: string; balance: number }>>([])
  const [selectedWalletCurrency, setSelectedWalletCurrency] = useState<string | null>(null)
  const [maxConsumptionPercentage, setMaxConsumptionPercentage] = useState<number>(100)
  const [useWallet, setUseWallet] = useState<boolean>(false)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number> | null>(null)
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false)
  const [selectedPayableCurrency, setSelectedPayableCurrency] = useState<string | null>(null)
  const [processingFeePercents, setProcessingFeePercents] = useState<RechargeProcessingFees>(
    DEFAULT_RECHARGE_PROCESSING_FEES,
  )

  const rechargeCurrency = useMemo(() => {
    return normalizeCurrencyCode(
      selectedPlan?.recharge_currency || pricing?.localCurrency || 'INR',
    )
  }, [selectedPlan, pricing])

  useEffect(() => {
    setSelectedPayableCurrency(rechargeCurrency)
  }, [rechargeCurrency])

  useEffect(() => {
    const loadFees = async () => {
      try {
        const res = await fetch('/api/settings/recharge-processing-fees', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        setProcessingFeePercents(parseRechargeProcessingFees(data))
      } catch {
        // keep default
      }
    }
    void loadFees()
  }, [])

  useEffect(() => {
    if (!selectedPlan || !pricing) {
      router.replace('/topup')
      return
    }
    if (!checkoutSessionId) {
      router.replace('/topup')
    }
  }, [selectedPlan, pricing, checkoutSessionId, router])

  // Fetch wallet balance
  useEffect(() => {
    if (!isAuthenticated) {
      setWalletBalance(null)
      setWalletCurrency(null)
      setAllWallets([])
      setSelectedWalletCurrency(null)
      return
    }
    const getBalance = async () => {
      setIsLoadingBalance(true)
      try {
        const headers: Record<string, string> = {}
        if (user?.id) {
          headers['x-user-id'] = user.id
          if (user.email) headers['x-user-email'] = user.email
          if (user.name) headers['x-user-name'] = user.name
          if (user.role) headers['x-user-role'] = user.role
        }
        const res = await fetch('/api/wallet/balance', { 
          credentials: 'include', 
          cache: 'no-store',
          headers,
        })
        if (res.ok) {
          const data = await res.json()
          if (data && typeof data.balance === 'number') {
            setWalletBalance(data.balance)
            setWalletCurrency(data.currency || 'USD')
            setMaxConsumptionPercentage(data.maxConsumptionPercentage ?? 100)
            if (data.wallets && Array.isArray(data.wallets)) {
              setAllWallets(data.wallets)
              setSelectedWalletCurrency((prev) => prev || data.currency || 'USD')
            } else {
              const defaultWal = [{ currency: data.currency || 'USD', balance: data.balance }]
              setAllWallets(defaultWal)
              setSelectedWalletCurrency((prev) => prev || data.currency || 'USD')
            }
          }
        } else if (res.status === 401) {
          // If the backend says unauthorized, clear frontend auth state
          useAuthStore.getState().setSession(null)
        }
      } catch (err) {
        console.error('Failed to load wallet balance:', err)
      } finally {
        setIsLoadingBalance(false)
      }
    }
    void getBalance()
  }, [isAuthenticated, user])

  // Fetch exchange rates for payable-currency conversion and wallet balances
  useEffect(() => {
    const getRates = async () => {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          if (data && data.rates) {
            setExchangeRates({ EUR: 1, ...data.rates })
          }
        }
      } catch (err) {
        console.error('Failed to fetch exchange rates:', err)
      }
    }
    void getRates()
  }, [])

  const payableCurrencyOptions = useMemo(
    () =>
      buildPayableCurrencyOptions({
        rechargeCurrency,
        userCurrency: user?.currency,
        walletCurrencies: allWallets.map((w) => w.currency),
      }),
    [rechargeCurrency, user?.currency, allWallets],
  )

  const payableCurrency = normalizeCurrencyCode(
    selectedPayableCurrency || rechargeCurrency,
  )

  const amounts = useMemo(() => {
    const ratesData = exchangeRates

    const planPrice =
      Number(selectedPlan?.recharge_amount) > 0
        ? Number(selectedPlan!.recharge_amount)
        : (pricing?.localAmount ?? 0)
    const subtotal = planPrice
    const feeParts = computeRechargeProcessingFeeAmount(subtotal, processingFeePercents)
    const serviceFee = feeParts.platformFee + feeParts.paymentGatewayFee
    const tax = feeParts.tax
    const fee = fees ?? feeParts.total
    const totalInRecharge = subtotal + fee

    let totalPayable = totalInRecharge
    let conversionFailed = false
    if (payableCurrency !== rechargeCurrency) {
      if (ratesData) {
        const converted = convertUsingEurBaseRates(
          totalInRecharge,
          rechargeCurrency,
          payableCurrency,
          ratesData,
        )
        if (converted == null) {
          conversionFailed = true
        } else {
          totalPayable = converted
        }
      } else {
        conversionFailed = true
      }
    }

    let walletBalInPayCurrency = 0
    let maxAllowedDeduction = 0
    let usedWalletAmount = 0

    if (isAuthenticated && walletBalance !== null) {
      const activeCurrency = normalizeCurrencyCode(
        selectedWalletCurrency || walletCurrency || 'USD',
      )
      const activeWallet = allWallets.find((w) => w.currency === activeCurrency)
      const activeBalance = activeWallet ? activeWallet.balance : walletBalance

      if (activeCurrency === payableCurrency) {
        walletBalInPayCurrency = activeBalance
      } else if (ratesData) {
        const walletInPayable = convertUsingEurBaseRates(
          activeBalance,
          activeCurrency,
          payableCurrency,
          ratesData,
        )
        walletBalInPayCurrency = walletInPayable ?? 0
      }

      maxAllowedDeduction = walletBalInPayCurrency * (maxConsumptionPercentage / 100)
      if (useWallet) {
        usedWalletAmount = Math.min(totalPayable, walletBalInPayCurrency, maxAllowedDeduction)
      }
    }

    const grand = Math.max(0, totalPayable - usedWalletAmount)

    return {
      subtotal,
      serviceFee,
      tax,
      fee,
      totalInRecharge,
      totalPayable,
      walletBalInPayCurrency,
      maxAllowedDeduction,
      usedWalletAmount,
      grand,
      rechargeCurrency,
      payableCurrency,
      conversionFailed,
    }
  }, [
    selectedPlan,
    pricing,
    fees,
    processingFeePercents,
    exchangeRates,
    isAuthenticated,
    walletBalance,
    walletCurrency,
    allWallets,
    selectedWalletCurrency,
    maxConsumptionPercentage,
    useWallet,
    rechargeCurrency,
    payableCurrency,
  ])

  const currency = amounts.payableCurrency
  const lineCurrency = amounts.rechargeCurrency

  const conversionRate = useMemo(() => {
    if (!exchangeRates || payableCurrency === rechargeCurrency) return null
    return crossRateUsingEurBase(rechargeCurrency, payableCurrency, exchangeRates)
  }, [exchangeRates, payableCurrency, rechargeCurrency])

  const walletConversionRate = useMemo(() => {
    if (!exchangeRates || !selectedWalletCurrency || !amounts.payableCurrency) return null
    return crossRateUsingEurBase(selectedWalletCurrency, amounts.payableCurrency, exchangeRates)
  }, [exchangeRates, selectedWalletCurrency, amounts.payableCurrency])

  const startPayment = useCallback(async () => {
    if (!selectedPlan || !pricing || isSubmitting) return
    setIsSubmitting(true)
    setError(null)

    const activeWalletCurrency = selectedWalletCurrency || walletCurrency || 'USD'

    try {
      // Wallet-only payment
      if (amounts.grand === 0) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (user?.id) {
          headers['x-user-id'] = user.id
          if (user.email) headers['x-user-email'] = user.email
          if (user.name) headers['x-user-name'] = user.name
          if (user.role) headers['x-user-role'] = user.role
        }
        const res = await fetch('/api/payment/wallet/checkout', {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({
            planId: selectedPlan.internalPlanId || selectedPlan.id,
            systemPlanId: selectedPlan.systemPlanId || selectedPlan.id,
            mobileNumber: buildInternationalMobile(countryCode, phoneNumber),
            operatorId: operatorProviderId || operator,
            countryId: countryCode,
            amount: amounts.totalPayable,
            currency: amounts.payableCurrency,
            walletCurrency: activeWalletCurrency,
            checkoutSessionId,
          }),
        })
        const data = await res.json()
        if (res.ok && data?.ok) {
          setTransactionResult({
            transactionId: data.transactionId || '',
            providerRef: data.providerRef || '',
            providerName: data.providerName || '',
            rechargeStatus: 'success',
            errorMessage: '',
            rewardPointsEarned: data.rewardPointsEarned ?? 0,
          })
          router.push('/topup/success')
        } else {
          throw new Error(data?.error || 'Wallet checkout failed')
        }
        return
      }

      // 1. Load Razorpay script
      const ok = await loadRazorpayScript()
      if (!ok) throw new Error('Unable to load Razorpay checkout')

      // 2. Create Razorpay order via new endpoint
      const createRes = await fetch('/api/payment/razorpay/create-order', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.internalPlanId || selectedPlan.id,
          systemPlanId: selectedPlan.systemPlanId || selectedPlan.id,
          amount: amounts.grand,
          currency: amounts.payableCurrency,
          mobileNumber: `+${getDialCode(countryCode)}${phoneNumber}`,
          operatorId: operatorProviderId || operator,
          countryId: countryCode,
          usedWalletBalance: amounts.usedWalletAmount,
          walletCurrency: activeWalletCurrency,
          checkoutSessionId,
        }),
      })
      const createData = await createRes.json()

      if (!createRes.ok || !createData?.razorpay_order_id) {
        throw new Error(createData?.error || 'Failed to create payment order')
      }

      const { paymentOrderId, razorpay_key_id, razorpay_order_id, razorpay_amount } = createData

      // 3. Open Razorpay Checkout Modal
      const opts = {
        key: razorpay_key_id,
        amount: razorpay_amount,
        currency: createData.currency || 'INR',
        name: 'ITU',
        description: `Recharge ${selectedPlan.planName || selectedPlan.id}`,
        order_id: razorpay_order_id,
        prefill: {
          contact: buildInternationalMobile(countryCode, phoneNumber),
        },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/payment/razorpay/verify', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                paymentOrderId,
                razorpay_order_id: response?.razorpay_order_id,
                razorpay_payment_id: response?.razorpay_payment_id,
                razorpay_signature: response?.razorpay_signature,
              }),
            })
            const verifyData = await verifyRes.json().catch(() => ({}))

            if (verifyRes.ok && verifyData?.ok) {
              setTransactionResult({
                transactionId: verifyData.transactionId || '',
                providerRef: verifyData.providerRef || '',
                providerName: verifyData.providerName || '',
                rechargeStatus: 'success',
                errorMessage: '',
                rewardPointsEarned: verifyData.rewardPointsEarned ?? 0,
              })
              router.push('/topup/success')
            } else {
              setTransactionResult({
                transactionId: verifyData.transactionId || '',
                rechargeStatus: 'failed',
                errorMessage: verifyData.error || 'Recharge processing failed',
                rewardPointsEarned: verifyData.rewardPointsEarned ?? 0,
              })
              router.push('/topup/failed')
            }
          } catch {
            setTransactionResult({
              rechargeStatus: 'failed',
              errorMessage: 'Payment verification failed. Please contact support.',
            })
            router.push('/topup/failed')
          }
        },
        modal: {
          ondismiss: () => {
            setIsSubmitting(false)
          },
        },
        theme: { color: '#F15A2B' },
      }

      const rzp = new window.Razorpay(opts)
      rzp.open()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      setIsSubmitting(false)
    }
  }, [
    selectedPlan,
    pricing,
    isSubmitting,
    amounts,
    countryCode,
    phoneNumber,
    operator,
    operatorProviderId,
    checkoutSessionId,
    setTransactionResult,
    router,
    selectedWalletCurrency,
    walletCurrency,
    user,
  ])

  // Auto-trigger payment after successful inline login
  useEffect(() => {
    if (payAfterLogin && isAuthenticated) {
      setPayAfterLogin(false)
      void startPayment()
    }
  }, [payAfterLogin, isAuthenticated, startPayment])

  // If the user logs out or is not authenticated, make sure useWallet is false
  useEffect(() => {
    if (!isAuthenticated) {
      setUseWallet(false)
    }
  }, [isAuthenticated])

  const proceedToPay = () => {
    if (!selectedPlan || !pricing || isSubmitting) return

    if (!isAuthenticated) {
      setLoginOpen(true)
      return
    }

    void startPayment()
  }

  if (!selectedPlan || !pricing) return null

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[#f3f9ff]">
      {/* Inline login dialog */}
      <InlineLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => {
          setPayAfterLogin(false)
          setUseWallet(true)
        }}
        defaultPhone={phoneNumber}
        countryIso={countryCode}
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          {/* Header */}
          <div className="px-6 py-6 md:px-8">
            <h1 className="text-center text-xl font-bold text-neutral-900 md:text-2xl">Recharge Summary</h1>
            <p className="mt-1 text-center text-xs text-neutral-400">
              Please confirm your recharge details before proceeding to payment
            </p>
          </div>

          <div className="grid gap-6 px-6 pb-8 md:grid-cols-[1fr_320px] md:px-8">
            {/* Left Column — Details */}
            <div className="space-y-5">
              {/* Recharge Details */}
              <div className="rounded-xl border border-neutral-200/80 bg-white p-5">
                <p className="text-sm font-semibold text-neutral-900">Recharge Details</p>
                <div className="mt-3 space-y-2 text-sm">
                  <DetailRow label="Mobile Number" value={buildInternationalMobile(countryCode, phoneNumber).replace(/^(\+\d+)/, '$1 ')} />
                  <DetailRow label="Country" value={countryCode} />
                  <DetailRow label="Operator" value={operator} />
                  <DetailRow
                    label="Plan Name"
                    value={
                      selectedPlan.planName ||
                      `${formatPlanRechargeValue(selectedPlan.recharge_amount, selectedPlan.recharge_currency)} • ${selectedPlan.validity}`
                    }
                  />
                  <DetailRow label="Validity" value={selectedPlan.validity} />
                </div>

                {/* Benefits */}
                <div className="mt-4 grid gap-3 rounded-lg bg-[#f3f9ff] p-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-neutral-500">Data</p>
                    <p className="text-xs font-semibold text-neutral-900">{selectedPlan.data || '2GB/day'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-neutral-500">Calls</p>
                    <p className="text-xs font-semibold text-neutral-900">{selectedPlan.calls || 'Unlimited'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-neutral-500">SMS</p>
                    <p className="text-xs font-semibold text-neutral-900">{selectedPlan.sms || '100/day'}</p>
                  </div>
                </div>

                {selectedPlan.benefits ? (
                  <div className="mt-4 flex items-center gap-3 rounded-lg bg-neutral-50 px-4 py-3 text-xs text-neutral-600 ring-1 ring-black/5">
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                      <Check className="h-4 w-4 text-emerald-600" />
                    </span>
                    {selectedPlan.benefits}
                  </div>
                ) : null}
              </div>

              {/* Customer Information */}
              <div className="rounded-xl border border-neutral-200/80 bg-white p-5">
                <p className="text-sm font-semibold text-neutral-900">Customer Information</p>
                <div className="mt-3 space-y-2 text-sm">
                  <DetailRow label="Phone" value={buildInternationalMobile(countryCode, phoneNumber).replace(/^(\+\d+)/, '$1 ')} />
                </div>
              </div>
            </div>

            {/* Right Column — Pricing & Pay */}
            <div className="space-y-5">
              {/* Pricing */}
              <div className="rounded-xl border border-neutral-200/80 bg-white p-5">
                <p className="text-sm font-bold text-neutral-900">Payment Summary</p>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Recharge Amount (MRP)</span>
                    <span className="font-semibold text-neutral-900">
                      {formatMoney(amounts.subtotal, lineCurrency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Service Fee</span>
                    <span className="font-semibold text-neutral-900">
                      {amounts.serviceFee > 0 ? formatMoney(amounts.serviceFee, lineCurrency) : 'Free'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Tax</span>
                    <span className="font-semibold text-neutral-900">
                      {amounts.tax > 0 ? formatMoney(amounts.tax, lineCurrency) : 'Free'}
                    </span>
                  </div>
                  {payableCurrency !== lineCurrency && (
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span>Subtotal in {lineCurrency}</span>
                      <span>{formatMoney(amounts.totalInRecharge, lineCurrency)}</span>
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    <div
                      onClick={() => {
                        if (!isAuthenticated) {
                          setLoginOpen(true)
                        }
                      }}
                      className="flex items-center gap-3 cursor-pointer rounded-xl border border-neutral-200 bg-neutral-50/50 p-2.5 hover:bg-neutral-50 transition-all select-none"
                    >
                      <input
                        type="checkbox"
                        checked={useWallet}
                        onChange={(e) => {
                          if (isAuthenticated) {
                            setUseWallet(e.target.checked)
                          }
                        }}
                        className="size-4 rounded border-neutral-300 text-[var(--hero-cta-orange)] focus:ring-[var(--hero-cta-orange)] accent-[var(--hero-cta-orange)] cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-neutral-800 flex justify-between gap-2">
                          <span className="truncate">Use Wallet Balance</span>
                          {isAuthenticated ? (
                            isLoadingBalance ? (
                              <span className="shrink-0 text-[10px] font-semibold text-neutral-400 animate-pulse">
                                Loading balance...
                              </span>
                            ) : walletBalance !== null ? (
                              <span className="shrink-0 font-extrabold text-neutral-900">
                                {formatMoney(amounts.walletBalInPayCurrency, amounts.payableCurrency)}
                                {selectedWalletCurrency && selectedWalletCurrency !== amounts.payableCurrency && (
                                  <span className="text-[10px] font-normal text-neutral-500 ml-1">
                                    ({(allWallets.find(w => w.currency === selectedWalletCurrency)?.balance ?? walletBalance ?? 0).toFixed(2)} {selectedWalletCurrency})
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] font-semibold text-red-500">
                                Failed to load balance
                              </span>
                            )
                          ) : (
                            <span className="shrink-0 text-[10px] font-semibold text-neutral-400">
                              Login to check balance
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-neutral-400 mt-0.5 leading-tight">
                          {isAuthenticated && walletBalance !== null ? (
                            maxConsumptionPercentage < 100 ? (
                              `Max ${maxConsumptionPercentage}% consumption allowed`
                            ) : (
                              `Pay up to 100% using wallet`
                            )
                          ) : (
                            'Apply your wallet balance to this order'
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Details of available wallets when useWallet is checked */}
                    {isAuthenticated && useWallet && (
                      <div className="space-y-2.5 pl-7 mt-2">
                        {isLoadingBalance ? (
                          <div className="flex items-center justify-center p-3 rounded-lg border border-neutral-100 bg-neutral-50/50">
                            <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                            <span className="text-xs text-neutral-500 ml-2">Loading wallet details...</span>
                          </div>
                        ) : allWallets.length > 0 ? (
                          <>
                            {allWallets.length > 1 && (
                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                                  Select Wallet Currency
                                </label>
                                <select
                                  value={selectedWalletCurrency || ''}
                                  onChange={(e) => setSelectedWalletCurrency(e.target.value)}
                                  className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 focus:border-[var(--hero-cta-orange)] focus:ring-[var(--hero-cta-orange)] focus:outline-none"
                                >
                                  {allWallets.map((w) => (
                                    <option key={w.currency} value={w.currency}>
                                      {w.currency} Wallet (Bal: {w.balance.toFixed(2)})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-2.5 space-y-1.5">
                              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                                Your Wallet Balances
                              </p>
                              <div className="divide-y divide-neutral-100">
                                {allWallets.map((w) => (
                                  <div key={w.currency} className="flex justify-between items-center py-1.5 text-xs text-neutral-700">
                                    <span className="font-medium">{w.currency} Wallet</span>
                                    <span className="font-semibold text-neutral-900">{w.balance.toFixed(2)} {w.currency}</span>
                                  </div>
                                ))}
                              </div>
                              {selectedWalletCurrency && selectedWalletCurrency !== amounts.payableCurrency && walletConversionRate && (
                                <div className="pt-1.5 border-t border-neutral-100 flex justify-between text-[10px] text-neutral-400">
                                  <span>Conversion Rate</span>
                                  <span className="font-semibold text-neutral-500">
                                    1 {selectedWalletCurrency} ≈ {walletConversionRate.toFixed(4)} {amounts.payableCurrency}
                                  </span>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="p-3 text-xs text-red-500 text-center rounded-lg border border-red-100 bg-red-50/50">
                            No wallet information available
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isAuthenticated && useWallet && amounts.usedWalletAmount > 0 && (
                    <div className="flex items-center justify-between text-emerald-600 font-semibold mt-1">
                      <span className="text-xs">Wallet Deduction</span>
                      <span className="text-xs">
                        -{formatMoney(amounts.usedWalletAmount, amounts.payableCurrency)}
                      </span>
                    </div>
                  )}

                  <div className="my-3 h-px bg-neutral-200" />
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider block">
                      Pay in currency
                    </label>
                    <select
                      value={payableCurrency}
                      onChange={(e) => setSelectedPayableCurrency(e.target.value)}
                      className="block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800 focus:border-[var(--hero-cta-orange)] focus:ring-[var(--hero-cta-orange)] focus:outline-none"
                    >
                      {payableCurrencyOptions.map((code) => (
                        <option key={code} value={code}>
                          {code}
                          {code === lineCurrency ? ' (plan currency)' : ''}
                        </option>
                      ))}
                    </select>
                    {payableCurrency !== lineCurrency && conversionRate && (
                      <p className="text-[10px] text-neutral-400">
                        1 {lineCurrency} ≈ {conversionRate.toFixed(4)} {payableCurrency}
                      </p>
                    )}
                    {amounts.conversionFailed && payableCurrency !== lineCurrency && (
                      <p className="text-[10px] font-medium text-amber-700">
                        Exchange rate unavailable. Select {lineCurrency} or try again shortly.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="font-semibold text-neutral-700">Total Payable</span>
                    <span className="text-lg font-bold text-neutral-900">
                      {formatMoney(amounts.grand, currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Proceed to Pay */}
              <div>
                {error ? <p className="mb-3 text-center text-sm font-medium text-red-600">{error}</p> : null}

                <Button
                  className={cn(
                    'h-12 w-full rounded-xl text-base font-semibold text-white hover:brightness-105',
                    'bg-[var(--hero-cta-orange)]',
                  )}
                  onClick={proceedToPay}
                  disabled={isSubmitting || amounts.conversionFailed}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing…
                    </>
                  ) : (
                    <>
                      Proceed to Pay
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
                <p className="mt-3 text-center text-[11px] text-neutral-400">
                  <Shield className="mr-1 inline h-3 w-3" />
                  Secure checkout • Razorpay • No hidden fees
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-10 text-center text-sm text-neutral-600">
          <TrustBadge title="Instant Top-Up" subtitle="In seconds" />
          <TrustBadge title="100% Secure" subtitle="Safe payments" />
          <TrustBadge title="Best Rates" subtitle="No hidden fees" />
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-2">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-semibold text-neutral-900">{value}</span>
    </div>
  )
}

function TrustBadge({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-left">
      <p className="font-semibold text-neutral-900">{title}</p>
      <p className="text-xs text-neutral-500">{subtitle}</p>
    </div>
  )
}
