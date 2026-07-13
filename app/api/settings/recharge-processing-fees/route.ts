import { NextResponse } from 'next/server'
import {
  computeRechargeProcessingFeeAmount,
  loadRechargeProcessingFeeConfig,
  resolveRechargeProcessingFeesForAmount,
  resolveRechargeProcessingFeesForLocalAmount,
  totalRechargeProcessingFeePercent,
} from '@/lib/settings/recharge-processing-fees'
import {
  convertAmountToEur,
  getMonthlyRechargeLimitEur,
  getMonthlyRechargeUsage,
} from '@/lib/settings/recharge-monthly-limit'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'

/** Public read-only fee ranges (EUR) for checkout / topup pricing. */
export async function GET(request: Request) {
  try {
    const config = await loadRechargeProcessingFeeConfig()
    const url = new URL(request.url)
    const amountParam = url.searchParams.get('amount')
    const currency = (url.searchParams.get('currency') || '').trim().toUpperCase() || 'EUR'
    const amount = amountParam != null ? Number(amountParam) : NaN
    const phone = url.searchParams.get('phone')?.trim() || null

    const monthlyLimitEur = getMonthlyRechargeLimitEur(config)

    const payload: Record<string, unknown> = {
      fee_type: 'percent_ranges',
      range_currency: 'EUR',
      ranges: config.ranges,
      monthlyLimitEur,
    }

    if (Number.isFinite(amount) && amount >= 0) {
      let resolved
      let amountEur: number | null = null

      if (currency === 'EUR') {
        amountEur = amount
        resolved = resolveRechargeProcessingFeesForAmount(amount, config)
      } else {
        // Prefer live EUR-base rates for client-parity conversion
        let eurBaseRates: Record<string, number> | null = null
        try {
          const rateRes = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' })
          if (rateRes.ok) {
            const data = (await rateRes.json()) as { rates?: Record<string, number> }
            if (data.rates) eurBaseRates = data.rates
          }
        } catch {
          /* catalog fallback below */
        }

        if (eurBaseRates) {
          const localResolved = resolveRechargeProcessingFeesForLocalAmount(
            amount,
            currency,
            config,
            eurBaseRates,
          )
          resolved = localResolved
          amountEur = localResolved.amountEur
        } else {
          amountEur = await convertAmountToEur(amount, currency)
          resolved =
            amountEur != null
              ? resolveRechargeProcessingFeesForAmount(amountEur, config)
              : { ...resolveRechargeProcessingFeesForAmount(0, config), rangeId: null }
        }
      }

      const computed = computeRechargeProcessingFeeAmount(amount, resolved)
      payload.resolved = {
        ...resolved,
        totalPercent: totalRechargeProcessingFeePercent(resolved),
        amountEur,
        currency,
      }
      payload.computed = {
        tax: computed.tax,
        platformFee: computed.platformFee,
        paymentGatewayFee: computed.paymentGatewayFee,
        total: computed.total,
        rangeId: resolved.rangeId,
      }
      payload.taxPercent = resolved.taxPercent
      payload.platformFeePercent = resolved.platformFeePercent
      payload.paymentGatewayFeePercent = resolved.paymentGatewayFeePercent
      payload.totalPercent = totalRechargeProcessingFeePercent(resolved)
    }

    const userId = await getUserIdFromRequest(request)
    if (userId || phone) {
      const usage = await getMonthlyRechargeUsage({
        config,
        userId,
        phoneNumber: phone,
      })
      payload.monthlyUsage = usage
    }

    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
