'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTopupStore } from '@/store/topupStore'
import { AlertTriangle, HeadphonesIcon, RotateCcw } from 'lucide-react'

const DIAL_CODES: Record<string, string> = { IN: '91', US: '1', GB: '44', AE: '971', SA: '966', BD: '880', PK: '92', NP: '977', LK: '94', NG: '234', KE: '254', GH: '233', ZA: '27', PH: '63', MY: '60', SG: '65' }
function dialCode(countryIso: string): string {
  return DIAL_CODES[countryIso.toUpperCase()] ?? countryIso
}

export default function TopupFailedPage() {
  const { transactionId, errorMessage, phoneNumber, countryCode, operator, selectedPlan, resetSession } =
    useTopupStore()

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[#f3f9ff]">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-16">
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          {/* Header */}
          <div className="bg-red-600 px-6 py-8 text-center text-white">
            <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white/20">
              <AlertTriangle className="h-7 w-7" />
            </span>
            <p className="text-lg font-bold">Recharge Failed</p>
            <p className="mt-1 text-xs text-white/90">
              We were unable to process your recharge. Your payment will be refunded if charged.
            </p>
          </div>

          {/* Details */}
          <div className="px-6 py-6">
            <div className="space-y-3 text-xs text-neutral-700">
              {errorMessage ? (
                <Row label="Reason" value={errorMessage} />
              ) : (
                <Row label="Reason" value="An unexpected error occurred during recharge processing" />
              )}
              {transactionId ? <Row label="Transaction ID" value={transactionId.slice(0, 12).toUpperCase()} mono /> : null}
              {phoneNumber ? <Row label="Mobile Number" value={`+${dialCode(countryCode)} ${phoneNumber}`} /> : null}
              {operator ? <Row label="Operator" value={operator} /> : null}
              {selectedPlan ? (
                <Row label="Plan" value={selectedPlan.planName || `₹${selectedPlan.price_inr} • ${selectedPlan.validity}`} />
              ) : null}
            </div>

            {/* Support */}
            <div className="mt-5 rounded-xl bg-neutral-50 px-4 py-4 ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <HeadphonesIcon className="mt-0.5 h-5 w-5 text-neutral-500" />
                <div>
                  <p className="text-xs font-semibold text-neutral-900">Need Help?</p>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    If your payment was deducted, it will be refunded within 5-7 business days.
                    Contact our support team for assistance.
                  </p>
                  <Link
                    href="/help"
                    className="mt-2 inline-block text-[11px] font-semibold text-[var(--hero-cta-orange)] underline underline-offset-2"
                  >
                    Contact Support
                  </Link>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 grid gap-3">
              <Button
                className={cn('h-11 rounded-xl bg-[var(--hero-cta-orange)] text-white hover:brightness-105')}
                onClick={() => {
                  // Keep plan selected for retry, just reset transaction fields
                  useTopupStore.getState().setTransactionResult({
                    transactionId: '',
                    providerRef: '',
                    providerName: '',
                    rechargeStatus: 'idle',
                    errorMessage: '',
                  })
                  window.location.href = '/topup/summary'
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => {
                  resetSession()
                  window.location.href = '/topup'
                }}
              >
                Start New Recharge
              </Button>
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
