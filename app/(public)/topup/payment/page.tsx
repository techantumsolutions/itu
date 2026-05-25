'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTopupStore } from '@/store/topupStore'
import { Button } from '@/components/ui/button'

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

export default function TopupPaymentPage() {
  const router = useRouter()
  const { orderId, pricing, totalAmount } = useTopupStore()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currency = pricing?.localCurrency ?? 'EUR'

  useEffect(() => {
    if (!orderId) router.replace('/topup')
  }, [orderId, router])

  const amountLabel = useMemo(() => {
    if (!pricing) return ''
    return `${totalAmount.toFixed(2)} ${pricing.localCurrency}`
  }, [pricing, totalAmount])

  const startPayment = async () => {
    if (!orderId || starting) return
    setStarting(true)
    setError(null)

    try {
      if (currency === 'INR') {
        const ok = await loadRazorpayScript()
        if (!ok) throw new Error('Unable to load Razorpay')

        const res = await fetch('/api/payment/create-session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, amount: totalAmount, currency: 'INR' }),
        })
        const data = await res.json()

        const opts = {
          key: data?.razorpay_key_id,
          amount: data?.razorpay_amount,
          currency: 'INR',
          name: 'ITU',
          description: 'Mobile top-up',
          order_id: data?.razorpay_order_id,
          handler: async (response: any) => {
            const verifyRes = await fetch('/api/payment/razorpay/verify', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId,
                razorpay_order_id: response?.razorpay_order_id,
                razorpay_payment_id: response?.razorpay_payment_id,
                razorpay_signature: response?.razorpay_signature,
              }),
            })
            const verifyData = await verifyRes.json().catch(() => ({}))
            if (verifyRes.ok && verifyData?.ok) {
              router.push('/topup/success')
            } else {
              router.push('/topup/review')
            }
          },
          modal: {
            ondismiss: async () => {
              await fetch('/api/payment/webhook', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId, status: 'failed' }),
              })
              router.push('/topup/review')
            },
          },
          theme: { color: '#F15A2B' },
        }

        const rzp = new window.Razorpay(opts)
        rzp.open()
        return
      }

      throw new Error('Payment gateway is not configured for this currency.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed')
      setStarting(false)
    }
  }

  // Auto-open once on mount (still shows this page between loading and success).
  useEffect(() => {
    if (!orderId) return
    void startPayment()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[#f3f9ff]">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <p className="text-lg font-bold text-neutral-900">Complete payment</p>
          <p className="mt-2 text-sm text-neutral-500">
            {currency === 'INR' ? 'Razorpay checkout will open to complete your payment.' : 'Processing payment…'}
          </p>
          {amountLabel ? <p className="mt-4 text-sm font-semibold text-neutral-800">Amount: {amountLabel}</p> : null}

          {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

          <div className="mt-6 flex flex-col gap-3">
            <Button
              className={cn(
                'h-11 rounded-full bg-[var(--hero-cta-orange)] px-8 text-sm font-semibold text-white hover:brightness-105',
              )}
              onClick={startPayment}
              disabled={starting}
            >
              {starting ? 'Opening gateway…' : 'Pay now'}
            </Button>
            <Button variant="outline" className="h-11 rounded-full" onClick={() => router.push('/topup/review')}>
              Back to review
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}


