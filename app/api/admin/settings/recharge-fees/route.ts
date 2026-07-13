import { NextResponse } from 'next/server'
import { logAdminActivity } from '@/lib/auth/audit'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import {
  loadRechargeProcessingFeeConfig,
  saveRechargeProcessingFeeConfig,
  validateRechargeProcessingFeeRanges,
} from '@/lib/settings/recharge-processing-fees'
import { getMonthlyRechargeLimitEur } from '@/lib/settings/recharge-monthly-limit'

export async function GET(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const config = await loadRechargeProcessingFeeConfig()
    return NextResponse.json({
      ranges: config.ranges,
      rangeCurrency: 'EUR',
      monthlyLimitEur: getMonthlyRechargeLimitEur(config),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || ctx.user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const validated = validateRechargeProcessingFeeRanges(body)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 })
    }

    const saved = await saveRechargeProcessingFeeConfig(validated.config)
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error ?? 'Failed to save' }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Update Recharge Processing Fees',
      pageName: 'System Settings',
      details: {
        rangeCurrency: 'EUR',
        monthlyLimitEur: getMonthlyRechargeLimitEur(validated.config),
        rangeCount: validated.config.ranges.length,
        ranges: validated.config.ranges.map((r) => ({
          id: r.id,
          minAmount: r.minAmount,
          maxAmount: r.maxAmount,
          taxPercent: r.taxPercent,
          platformFeePercent: r.platformFeePercent,
          paymentGatewayFeePercent: r.paymentGatewayFeePercent,
        })),
      },
    })

    return NextResponse.json({
      ok: true,
      ranges: validated.config.ranges,
      rangeCurrency: 'EUR',
      monthlyLimitEur: getMonthlyRechargeLimitEur(validated.config),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
