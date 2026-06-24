import { NextResponse } from 'next/server'
import { logAdminActivity } from '@/lib/auth/audit'
import { getAdminFromAccessCookie } from '@/lib/auth/get-admin-from-request'
import {
  loadRechargeProcessingFees,
  parseRechargeProcessingFees,
  saveRechargeProcessingFees,
  totalRechargeProcessingFeePercent,
} from '@/lib/settings/recharge-processing-fees'

export async function GET(request: Request) {
  const ctx = await getAdminFromAccessCookie(request)
  if (!ctx?.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'super_admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const fees = await loadRechargeProcessingFees()
    return NextResponse.json({
      ...fees,
      totalPercent: totalRechargeProcessingFeePercent(fees),
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
    const fees = parseRechargeProcessingFees(body)

    const saved = await saveRechargeProcessingFees(fees)
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error ?? 'Failed to save' }, { status: 500 })
    }

    await logAdminActivity({
      action: 'Update Recharge Processing Fees',
      pageName: 'System Settings',
      details: { ...fees, totalPercent: totalRechargeProcessingFeePercent(fees) },
    })

    return NextResponse.json({
      ok: true,
      ...fees,
      totalPercent: totalRechargeProcessingFeePercent(fees),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 })
  }
}
