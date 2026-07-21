'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTopupStore } from '@/store/topupStore'
import { Button } from '@/components/ui/button'

export default function TopupPaymentPage() {
  const router = useRouter()
  const { orderId, pricing, totalAmount } = useTopupStore()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) router.replace('/topup')
  }, [orderId, router])

  const amountLabel = useMemo(() => {
    if (!pricing) return ''
    return `${totalAmount.toFixed(2)} ${pricing.localCurrency}`
  }, [pricing, totalAmount])

  useEffect(() => {
    if (!orderId) return
    setError(
      'This payment page is retired. Start again from top-up and complete checkout on the summary page.',
    )
  }, [orderId])

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4">
      <p className="text-sm text-neutral-600">{amountLabel}</p>
      {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
      <Button className={cn('min-w-[12rem]')} onClick={() => router.push('/topup')}>
        Back to top-up
      </Button>
    </div>
  )
}
