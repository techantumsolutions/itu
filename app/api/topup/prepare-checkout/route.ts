import { NextResponse } from 'next/server'
import { guardCatalog } from '@/lib/db/require-catalog'
import { prepareCheckout } from '@/lib/topup/prepare-checkout-service'
import { supabaseGetUser } from '@/lib/supabase/auth-rest'

async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const cookie = request.headers.get('cookie') ?? ''
  const m = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/)
  const token = m?.[1] ? decodeURIComponent(m[1]) : ''
  if (token) {
    try {
      const user = await supabaseGetUser(token)
      if (user?.id) return user.id
    } catch {
      // ignore
    }
  }
  const om = cookie.match(/(?:^|;\s*)itu-user-id=([^;]+)/)
  return om?.[1] ? decodeURIComponent(om[1]) : null
}

/** Pre-payment: routing rules + LCR, persist provider selection, create PENDING_PAYMENT transaction. */
export async function POST(request: Request) {
  const denied = guardCatalog()
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
    const systemPlanId = typeof body.systemPlanId === 'string' ? body.systemPlanId.trim() : ''
    const mobileNumber = typeof body.mobileNumber === 'string' ? body.mobileNumber.trim() : ''
    const operatorId = typeof body.operatorId === 'string' ? body.operatorId.trim() : ''
    const countryId = typeof body.countryId === 'string' ? body.countryId.trim() : ''
    const amount = Number(body.amount)
    const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'INR'

    if (!planId || !mobileNumber || !operatorId || !countryId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: planId, mobileNumber, operatorId, countryId, amount' },
        { status: 400 },
      )
    }

    const userId = await getUserIdFromRequest(request)
    const result = await prepareCheckout({
      planId,
      systemPlanId: systemPlanId || undefined,
      mobileNumber,
      operatorId,
      countryId,
      amount,
      currency,
      userId: userId || undefined,
    })

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error ?? 'Provider selection failed',
          transactionId: result.transactionId,
        },
        { status: 422 },
      )
    }

    return NextResponse.json({
      ok: true,
      checkoutSessionId: result.checkoutSessionId,
      transactionId: result.transactionId,
      rechargeOrderId: result.rechargeOrderId,
      rechargeAttemptId: result.rechargeAttemptId,
      selectedProviderId: result.selectedProviderId,
      selectedProviderName: result.selectedProviderName,
      selectedProviderPlanId: result.selectedProviderPlanId,
      selectedProviderCost: result.selectedProviderCost,
      selectedProviderCurrency: result.selectedProviderCurrency,
    })
  } catch (e) {
    console.error('topup/prepare-checkout:', e)
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'prepare-checkout failed' },
      { status: 500 },
    )
  }
}
