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
import { Check, ChevronRight, Eye, EyeOff, Loader2, LogIn, Shield, Smartphone } from 'lucide-react'

const DIAL_CODES: Record<string, string> = { IN: '91', US: '1', GB: '44', AE: '971', SA: '966', BD: '880', PK: '92', NP: '977', LK: '94', NG: '234', KE: '254', GH: '233', ZA: '27', PH: '63', MY: '60', SG: '65' }
function dialCode(countryIso: string): string {
  return DIAL_CODES[countryIso.toUpperCase()] ?? countryIso
}

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
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
  defaultPhone: string
}) {
  const { login, setSession } = useAuthStore()
  const [tab, setTab] = useState<'mobile' | 'email'>('mobile')

  // --- Mobile OTP state ---
  const [phone, setPhone] = useState(defaultPhone)
  const [otpStep, setOtpStep] = useState<'phone' | 'otp'>('phone')
  const [otpValue, setOtpValue] = useState('')
  const [otpTimer, setOtpTimer] = useState(0)
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)

  // --- Email state ---
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)

  const [err, setErr] = useState('')

  // OTP countdown
  useEffect(() => {
    if (otpTimer <= 0) return
    const t = setInterval(() => setOtpTimer((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [otpTimer])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setErr('')
      setOtpStep('phone')
      setOtpValue('')
      setPhone(defaultPhone)
    }
  }, [open, defaultPhone])

  const normalizedPhone = phone.replace(/[^\d]/g, '')

  const sendOtp = async () => {
    if (normalizedPhone.length < 10) return
    setSendingOtp(true)
    setErr('')
    try {
      const res = await fetch('/api/auth/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${normalizedPhone}` }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to send OTP')
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
        body: JSON.stringify({ phone: `+91${normalizedPhone}`, otp: otpValue }),
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
    const result = await login(email, password)
    setEmailLoading(false)
    if (result.ok) {
      onOpenChange(false)
      onSuccess()
    } else {
      setErr(result.error ?? 'Invalid email or password')
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

        <Tabs value={tab} onValueChange={(v) => { setTab(v as 'mobile' | 'email'); setErr('') }}>
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
                    <span className="flex h-11 items-center rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm font-semibold text-neutral-700">+91</span>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="9999999999"
                      className="h-11"
                      maxLength={10}
                    />
                  </div>
                </div>
                <Button
                  className="h-11 w-full rounded-xl bg-[var(--hero-cta-orange)] font-semibold text-white hover:brightness-105"
                  disabled={sendingOtp || normalizedPhone.length < 10}
                  onClick={sendOtp}
                >
                  {sendingOtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {sendingOtp ? 'Sending OTP…' : 'Send OTP'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-center text-sm text-neutral-600">
                  Enter the 6-digit code sent to <span className="font-semibold">+91 {normalizedPhone}</span>
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
              </>
            )}
          </TabsContent>

          {/* ---- Email / Password Tab ---- */}
          <TabsContent value="email" className="space-y-4 pt-2">
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
              disabled={emailLoading || !email.trim() || !password}
              onClick={loginEmail}
            >
              {emailLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {emailLoading ? 'Logging in…' : 'Log In & Pay'}
            </Button>
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
    selectedPlan,
    pricing,
    fees,
    totalAmount,
    setTransactionResult,
  } = useTopupStore()
  const { isAuthenticated } = useAuthStore()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)
  const [payAfterLogin, setPayAfterLogin] = useState(false)

  useEffect(() => {
    if (!selectedPlan || !pricing) router.replace('/topup')
  }, [selectedPlan, pricing, router])

  const amounts = useMemo(() => {
    const subtotal = pricing?.localAmount ?? 0
    const fee = fees ?? 0
    const grand = Math.max(0, subtotal + fee)
    return { subtotal, fee, grand }
  }, [pricing?.localAmount, fees])

  const currency = pricing?.localCurrency ?? 'INR'

  const startPayment = useCallback(async () => {
    if (!selectedPlan || !pricing || isSubmitting) return
    setIsSubmitting(true)
    setError(null)

    try {
      // 1. Load Razorpay script
      const ok = await loadRazorpayScript()
      if (!ok) throw new Error('Unable to load Razorpay checkout')

      // 2. Create Razorpay order via new endpoint
      // Razorpay only supports INR — always use the plan's INR price
      const razorpayAmount = selectedPlan.price_inr + (fees ?? 0)
      const createRes = await fetch('/api/payments/razorpay/create-order', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: selectedPlan.internalPlanId || selectedPlan.id,
          amount: razorpayAmount,
          currency: 'INR',
          mobileNumber: `+${dialCode(countryCode)}${phoneNumber}`,
          operatorId: operator,
          countryId: countryCode,
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
          contact: `+${dialCode(countryCode)}${phoneNumber}`,
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
              })
              router.push('/topup/success')
            } else {
              setTransactionResult({
                transactionId: verifyData.transactionId || '',
                rechargeStatus: 'failed',
                errorMessage: verifyData.error || 'Recharge processing failed',
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
  }, [selectedPlan, pricing, isSubmitting, amounts.grand, currency, countryCode, phoneNumber, operator, setTransactionResult, router])

  // Auto-trigger payment after successful inline login
  useEffect(() => {
    if (payAfterLogin && isAuthenticated) {
      setPayAfterLogin(false)
      void startPayment()
    }
  }, [payAfterLogin, isAuthenticated, startPayment])

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
        onSuccess={() => setPayAfterLogin(true)}
        defaultPhone={phoneNumber}
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
                  <DetailRow label="Mobile Number" value={`+${dialCode(countryCode)} ${phoneNumber}`} />
                  <DetailRow label="Country" value={countryCode} />
                  <DetailRow label="Operator" value={operator} />
                  <DetailRow label="Plan Name" value={selectedPlan.planName || `₹${selectedPlan.price_inr} • ${selectedPlan.validity}`} />
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
                  <DetailRow label="Phone" value={`+${dialCode(countryCode)} ${phoneNumber}`} />
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
                      ₹{selectedPlan.price_inr} / €{selectedPlan.price_eur}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Processing Fee</span>
                    <span className="font-semibold text-neutral-900">
                      {amounts.fee > 0 ? `${amounts.fee.toFixed(2)} ${currency}` : 'Free'}
                    </span>
                  </div>
                  <div className="my-3 h-px bg-neutral-200" />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-700">Total Payable</span>
                    <span className="text-lg font-bold text-neutral-900">
                      {amounts.grand.toFixed(2)} {currency}
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
                  disabled={isSubmitting}
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
