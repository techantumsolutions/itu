'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useTopupStore } from '@/store/topupStore'
import { Check, ChevronRight } from 'lucide-react'

export default function TopupReviewPage() {
  const router = useRouter()
  const { phoneNumber, countryCode, operator, selectedPlan, pricing, fees } = useTopupStore()
  const [promo, setPromo] = useState('')
  const [promoMsg, setPromoMsg] = useState<string | null>(null)
  const [discount, setDiscount] = useState(0)
  const [isApplying, setIsApplying] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const amounts = useMemo(() => {
    const subtotal = pricing?.localAmount ?? 0
    const fee = fees ?? 0
    const grand = Math.max(0, subtotal + fee - discount)
    return { subtotal, fee, grand }
  }, [pricing?.localAmount, fees, discount])

  const applyPromo = async () => {
    if (!promo.trim()) return
    setIsApplying(true)
    setPromoMsg(null)
    try {
      const res = await fetch('/api/promo/apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promo, subtotal: amounts.subtotal }),
      })
      const data = await res.json()
      if (data?.valid) {
        setDiscount(Number(data.discount ?? 0))
        setPromoMsg('Applied')
      } else {
        setDiscount(0)
        setPromoMsg('Invalid code')
      }
    } finally {
      setIsApplying(false)
    }
  }

  const proceed = async () => {
    if (!selectedPlan || !pricing) return
    setIsSubmitting(true)
    try {
      // Legacy create-session (client amounts) is disabled. Use the prepare-checkout summary flow.
      router.push('/topup')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!selectedPlan || !pricing) return null

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[#f3f9ff]">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="px-6 py-6 md:px-8">
            <h1 className="text-center text-xl font-bold text-neutral-900 md:text-2xl">Review your Order</h1>
            <p className="mt-1 text-center text-xs text-neutral-400">
              Please confirm your recharge details before proceeding to payment
            </p>
          </div>
          <div className="grid gap-6 px-6 pb-8 md:grid-cols-[1fr_320px] md:px-8">
            <div className="space-y-5">
              <div className="rounded-xl border border-neutral-200/80 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">{operator}</p>
                    <p className="mt-1 text-sm text-neutral-700">
                      +{countryCode} {phoneNumber}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">Airtel, India</p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-neutral-400 hover:text-neutral-700 hover:underline"
                  >
                    Change
                  </button>
                </div>
                <div className="mt-4 grid gap-3 rounded-lg bg-[#f3f9ff] p-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-neutral-500">Benefits</p>
                    <p className="text-xs font-semibold text-neutral-900">{selectedPlan.data || '2GB/day'}</p>
                    <p className="text-[11px] text-neutral-500">{selectedPlan.calls || 'Unlimited Calls'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-neutral-500">Validity</p>
                    <p className="text-xs font-semibold text-neutral-900">{selectedPlan.validity}</p>
                    <p className="text-[11px] text-neutral-500">Valid for {selectedPlan.validity}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-neutral-500">Subscriptions</p>
                    <p className="text-xs font-semibold text-neutral-900">N/A</p>
                    <p className="text-[11px] text-neutral-500">—</p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-lg bg-neutral-50 px-4 py-3 text-xs text-neutral-600 ring-1 ring-black/5">
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-white ring-1 ring-black/5">
                    <Check className="h-4 w-4 text-emerald-600" />
                  </span>
                  Get unlimited local STD & roaming calls + 2GB/day data + 100 sms/day
                </div>
              </div>

              <div className="rounded-xl border border-neutral-200/80 bg-white p-5">
                <p className="text-sm font-semibold text-neutral-900">Have a promo code?</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <Input
                    value={promo}
                    onChange={(e) => setPromo(e.target.value)}
                    placeholder="Enter your promo code"
                    className="h-11 rounded-full"
                  />
                  <Button
                    className="h-11 rounded-full bg-[var(--hero-cta-orange)] px-8 font-semibold text-white hover:brightness-105"
                    onClick={applyPromo}
                    disabled={isApplying}
                  >
                    Apply
                  </Button>
                  <div className="flex items-center justify-center rounded-xl bg-neutral-50 px-4 py-2 text-xs text-neutral-500 ring-1 ring-black/5">
                    You get <span className="ml-1 font-bold text-neutral-800">5 pts</span>
                  </div>
                </div>
                {promoMsg ? <p className="mt-2 text-xs text-neutral-500">{promoMsg}</p> : null}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-white p-5">
              <p className="text-sm font-bold text-neutral-900">Order summary</p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Top-up subtotal</span>
                  <span className="font-semibold text-neutral-900">
                    {amounts.subtotal.toFixed(2)} {pricing.localCurrency}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Top-up fee</span>
                  <span className="font-semibold text-neutral-900">
                    {amounts.fee.toFixed(2)} {pricing.localCurrency}
                  </span>
                </div>
                {discount > 0 ? (
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Promo discount</span>
                    <span className="font-semibold text-emerald-700">
                      -{discount.toFixed(2)} {pricing.localCurrency}
                    </span>
                  </div>
                ) : null}
                <div className="my-3 h-px bg-neutral-200" />
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-700">Grand total</span>
                  <span className="text-lg font-bold text-neutral-900">
                    {amounts.grand.toFixed(2)} {pricing.localCurrency}
                  </span>
                </div>
              </div>

              <Button
                className={cn('mt-5 h-12 w-full rounded-xl bg-[var(--hero-cta-orange)] text-base font-semibold text-white hover:brightness-105')}
                onClick={proceed}
                disabled={isSubmitting}
              >
                Proceed to Payment
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
              <p className="mt-3 text-center text-[11px] text-neutral-400">Secure checkout • No hidden fees</p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-10 text-center text-sm text-neutral-600">
          <div className="text-left">
            <p className="font-semibold text-neutral-900">Instant Top-Up</p>
            <p className="text-xs text-neutral-500">In seconds</p>
          </div>
          <div className="text-left">
            <p className="font-semibold text-neutral-900">100% Secure</p>
            <p className="text-xs text-neutral-500">Safe payments</p>
          </div>
          <div className="text-left">
            <p className="font-semibold text-neutral-900">Best Rates</p>
            <p className="text-xs text-neutral-500">No hidden fees</p>
          </div>
        </div>
      </div>
    </div>
  )
}


