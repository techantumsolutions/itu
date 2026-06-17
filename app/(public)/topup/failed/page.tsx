'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTopupStore } from '@/store/topupStore'
import { AlertTriangle, HeadphonesIcon, RotateCcw, Sparkles } from 'lucide-react'
import { getDialCode } from '@/lib/lcr/countries'
import { ConfettiCelebration } from '@/components/confetti-celebration'

export default function TopupFailedPage() {
  const {
    transactionId,
    errorMessage,
    phoneNumber,
    countryCode,
    operator,
    selectedPlan,
    resetSession,
    rewardPointsEarned,
  } = useTopupStore()

  return (
    <div className="min-h-[calc(100vh-6rem)] bg-[#f3f9ff]">
      {/* Confetti fires even on failure if the user earned reward points */}
      {rewardPointsEarned > 0 && <ConfettiCelebration />}

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

          {/* Reward Points Banner — shown even on failed recharge */}
          {rewardPointsEarned > 0 && (
            <div className="mx-6 mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 ring-1 ring-amber-200/80">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-neutral-900">Reward Points Earned! 🎉</p>
                  <p className="text-[11px] text-neutral-500">Points credited despite recharge failure</p>
                </div>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-amber-600 ring-1 ring-amber-200 shrink-0">
                +{rewardPointsEarned} pts
              </div>
            </div>
          )}

          {/* Details */}
          <div className="px-6 py-6">
            <div className="space-y-3 text-xs text-neutral-700">
              {errorMessage ? (
                <Row label="Reason" value={errorMessage} />
              ) : (
                <Row label="Reason" value="An unexpected error occurred during recharge processing" />
              )}
              {transactionId ? <Row label="Transaction ID" value={transactionId.slice(0, 12).toUpperCase()} mono /> : null}
              {phoneNumber ? <Row label="Mobile Number" value={`+${getDialCode(countryCode)} ${phoneNumber}`} /> : null}
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
                    rewardPointsEarned: 0,
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
