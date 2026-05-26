'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTopupStore } from '@/store/topupStore'
import { Download, RotateCcw } from 'lucide-react'

import { getDialCode } from '@/lib/lcr/countries'

export default function TopupSuccessPage() {
  const { orderId, phoneNumber, countryCode, operator, selectedPlan, pricing, totalAmount, resetSession, transactionId, providerRef, providerName } =
    useTopupStore()

  const refId = useMemo(() => {
    if (transactionId) return transactionId.slice(0, 12).toUpperCase()
    if (orderId) return orderId.slice(0, 12).toUpperCase()
    return ''
  }, [transactionId, orderId])
  const dt = useMemo(() => new Date().toLocaleString(), [])

  if ((!orderId && !transactionId) || !selectedPlan || !pricing) return null

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[var(--hero-navy)]">
      <div className="pointer-events-none absolute inset-0 opacity-35" aria-hidden />
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_-30px_rgba(0,0,0,0.6)]">
          <div className="bg-emerald-600 px-6 py-8 text-center text-white">
            <p className="text-lg font-bold">Recharge Successful!</p>
            <p className="mt-1 text-xs text-white/90">
              Your transaction has been successfully processed and your benefits are now active
            </p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-neutral-900">
                You Paid{' '}
                <span className="ml-1 font-bold">
                  {totalAmount.toFixed(2)} {pricing.localCurrency}
                </span>
              </div>
              <div className="rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-neutral-900">
                Amount in INR <span className="ml-1 font-bold">₹ {selectedPlan.price_inr}</span>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="space-y-3 text-xs text-neutral-700">
              <Row label="Transaction ID" value={refId} mono />
              <Row label="Mobile Number" value={`+${getDialCode(countryCode)} ${phoneNumber}`} />
              <Row label="Operator" value={operator} />
              <Row label="Plan Name" value={selectedPlan.planName || `₹${selectedPlan.price_inr} • ${selectedPlan.validity}`} />
              <Row
                label="Amount Paid"
                value={`${totalAmount.toFixed(2)} ${pricing.localCurrency} (₹ ${selectedPlan.price_inr})`}
              />
              {providerRef ? <Row label="Provider Reference" value={providerRef} mono /> : null}
              {providerName ? <Row label="Provider" value={providerName} /> : null}
              <Row label="Date & Time" value={dt} />
            </div>

            <div className="mt-5 grid gap-3">
              <Button
                variant="outline"
                className="h-11 w-full justify-between rounded-xl bg-white text-neutral-800 hover:bg-neutral-50"
                asChild
              >
                <a href={`/api/receipt/${orderId}`} target="_blank" rel="noopener noreferrer">
                  <span className="flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Download Receipt
                  </span>
                  <span className="text-xs text-neutral-400">Download Pdf</span>
                </a>
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <Button className={cn('h-11 rounded-xl bg-[var(--hero-navy)] text-white hover:bg-[var(--hero-navy)]/95')} asChild>
                  <Link href="/account/transactions">View Transaction History</Link>
                </Button>
                <Button
                  className={cn('h-11 rounded-xl bg-[var(--hero-cta-orange)] text-white hover:brightness-105')}
                  onClick={() => {
                    resetSession()
                    window.location.href = '/topup'
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Recharge Again
                </Button>
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-200 bg-white px-6 py-5">
            <div className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-3 ring-1 ring-black/5">
              <div>
                <p className="text-xs font-semibold text-neutral-900">Rewarded Conversion</p>
                <p className="text-[11px] text-neutral-500">Thanks for using our service! You have earned</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-neutral-900 ring-1 ring-black/5">10+</div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-10 text-center text-sm text-neutral-600">
              <TrustItem title="Instant Top-Up" subtitle="In seconds" />
              <TrustItem title="100% Secure" subtitle="Safe payments" />
              <TrustItem title="Best Rates" subtitle="No hidden fees" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-2">
      <span className="text-neutral-500">{label}</span>
      <span className={cn('text-right font-semibold text-neutral-900', mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  )
}

function TrustItem({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-left">
      <p className="text-xs font-semibold text-neutral-900">{title}</p>
      <p className="text-[11px] text-neutral-500">{subtitle}</p>
    </div>
  )
}


