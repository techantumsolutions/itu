import { NextResponse } from 'next/server'
import {
  computeRechargeProcessingFeeAmount,
  loadRechargeProcessingFees,
  totalRechargeProcessingFeePercent,
} from '@/lib/settings/recharge-processing-fees'

/** Public read-only fee percentages for checkout / topup pricing. */
export async function GET(request: Request) {
  try {
    const fees = await loadRechargeProcessingFees()
    const totalPercent = totalRechargeProcessingFeePercent(fees)
    const amountParam = new URL(request.url).searchParams.get('amount')
    const amount = amountParam != null ? Number(amountParam) : NaN

    const payload: Record<string, unknown> = {
      ...fees,
      totalPercent,
    }

    if (Number.isFinite(amount) && amount >= 0) {
      payload.computed = computeRechargeProcessingFeeAmount(amount, fees)
    }

    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
