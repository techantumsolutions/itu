import { NextResponse } from 'next/server'
import { isApiConfigured, sendTransfer } from '@/lib/api/ding-connect'
import { selectBestProviderWithObservability } from '@/lib/api/lcr-engine'
import { isLcrV2Enabled } from '@/lib/lcr-v2/flags'
import { processLcrV2Recharge, lcrV2AttemptToApiOrder } from '@/lib/lcr-v2/recharge'
import {
  dbFindRechargeByDistributorRef,
  dbFindRechargeById,
  dbGetInternalPlan,
} from '@/lib/lcr-v2/recharge-db'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { getAuthenticatedRequestUser } from '@/lib/tickets/auth-headers'
import { executeCheckout } from '@/lib/topup/checkout-service'
import {
  extractCheckoutTransactionId,
  requireVerifiedPaidRecharge,
} from '@/lib/security/require-paid-recharge'

/**
 * Provider recharge HTTP entry.
 *
 * Path A — paid checkout: transactionId + auth + paid payment_order → executeCheckout
 * Path B — admin sandbox: authenticated admin with providers.execute → LCR/Ding test
 *
 * Anonymous requests never reach executeCheckout / processLcrV2Recharge / sendTransfer.
 * RECHARGE_PUBLIC_ENABLED is removed; no env var enables unpaid public execution.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const checkoutTxnId = extractCheckoutTransactionId(body)

  // ----- Path A: verified paid customer checkout -----
  if (checkoutTxnId) {
    const gate = await requireVerifiedPaidRecharge(request, body)
    if (!gate.ok) return gate.response

    const po = gate.paymentOrder
    const meta =
      po.metadata && typeof po.metadata === 'object'
        ? (po.metadata as Record<string, unknown>)
        : {}
    const systemPlanId =
      typeof meta.system_plan_id === 'string' ? meta.system_plan_id.trim() : undefined

    const result = await executeCheckout({
      paymentOrderId: gate.paymentOrderId,
      planId: String(po.plan_id ?? ''),
      systemPlanId: systemPlanId || undefined,
      mobileNumber: String(po.mobile_number ?? ''),
      operatorId: String(po.operator_id ?? ''),
      countryId: String(po.country_id ?? ''),
      amount: Number(po.amount ?? 0) + Number(meta.used_wallet_balance ?? 0),
      currency: String(po.currency ?? 'INR'),
      razorpayPaymentId: String(po.payment_id ?? `recharge-api-${gate.paymentOrderId}`),
      userId: gate.userId,
      usedWalletBalance: Number(meta.used_wallet_balance ?? 0) || undefined,
      walletCurrency:
        typeof meta.wallet_currency === 'string' ? meta.wallet_currency : undefined,
      checkoutSessionId: gate.transactionId,
      pendingTransactionId: gate.transactionId,
    })

    return NextResponse.json(
      {
        success: result.ok,
        ok: result.ok,
        transactionId: result.transactionId,
        rechargeOrderId: result.rechargeOrderId,
        providerRef: result.providerRef,
        providerName: result.providerName,
        status: result.status,
        error: result.error,
        hints: result.hints,
        message: result.ok
          ? 'Recharge executed via verified paid checkout'
          : result.error ?? 'Recharge failed',
      },
      { status: result.ok ? 200 : 422 },
    )
  }

  // ----- Path B: authenticated admin sandbox (providers.execute) -----
  const denied = await requireAdminPermission(request, 'providers.execute')
  if (denied) return denied

  try {
    const {
      skuCode,
      sendAmount,
      phoneNumber,
      countryCode,
      carrierCode,
      carrierName,
      productName,
      receiveCurrency,
      receiveAmount,
      sendCurrency,
      systemPlanId,
      internalPlanId,
    } = body

    if (isLcrV2Enabled()) {
      const planId = typeof internalPlanId === 'string' ? internalPlanId.trim() : ''
      const sysPlanId = typeof systemPlanId === 'string' ? systemPlanId.trim() : ''
      const sku = typeof skuCode === 'string' ? skuCode.trim() : ''
      if (!phoneNumber || (!sysPlanId && !planId && !sku)) {
        return NextResponse.json(
          { error: 'Missing required fields: phoneNumber and (systemPlanId, internalPlanId, or skuCode)' },
          { status: 400 },
        )
      }
      if (sendAmount == null || Number(sendAmount) <= 0) {
        return NextResponse.json({ error: 'sendAmount is required for LCR v2 recharge' }, { status: 400 })
      }

      const v2 = await processLcrV2Recharge(request, {
        systemPlanId: sysPlanId || undefined,
        internalPlanId: planId || undefined,
        skuCode: sku || undefined,
        phoneNumber: String(phoneNumber),
        sendAmount: Number(sendAmount),
        countryCode: typeof countryCode === 'string' ? countryCode : undefined,
        carrierCode: typeof carrierCode === 'string' ? carrierCode : undefined,
        carrierName: typeof carrierName === 'string' ? carrierName : undefined,
        productName: typeof productName === 'string' ? productName : undefined,
        receiveCurrency: typeof receiveCurrency === 'string' ? receiveCurrency : undefined,
        receiveAmount: receiveAmount != null ? Number(receiveAmount) : undefined,
        idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
      })

      if (!v2.ok) {
        return NextResponse.json(
          {
            success: false,
            error: 'error' in v2 ? v2.error : 'LCR v2 failed',
            decision: 'decision' in v2 ? v2.decision : undefined,
            attempts: 'attempts' in v2 ? v2.attempts : undefined,
            hints: 'hints' in v2 ? v2.hints : undefined,
          },
          { status: v2.status },
        )
      }

      if ('cached' in v2 && v2.cached && v2.attempt) {
        const plan = await dbGetInternalPlan(v2.attempt.internal_plan_id)
        const skuOut = v2.attempt.selected_provider_plan_id || sku || planId || sysPlanId
        const order = lcrV2AttemptToApiOrder({
          attempt: v2.attempt,
          internalPlan: plan ?? {},
          skuCode: skuOut,
          extras: { countryCode, carrierCode, receiveAmount, receiveCurrency },
        })
        return NextResponse.json({
          success: true,
          order: { ...order, countryCode, carrierCode, carrierName, receiveAmount, receiveCurrency },
          lcr: { v2: true, cached: true, decision: v2.attempt.routing_decision },
          hints: 'hints' in v2 ? v2.hints : undefined,
          message: 'Admin sandbox recharge completed (idempotent replay)',
        })
      }

      if ('internalPlan' in v2 && v2.internalPlan) {
        const order = lcrV2AttemptToApiOrder({
          attempt: {
            distributor_ref: String(v2.distributorRef ?? ''),
            phone_number: String(body.phoneNumber).replace(/\D/g, ''),
            send_amount: Number(sendAmount),
            currency: String(receiveCurrency ?? sendCurrency ?? ''),
            status: 'success',
            provider_ref: v2.providerRef ?? null,
            routing_decision: v2.decision ?? {},
            internal_plan_id: String(v2.internalPlan.id),
            selected_provider_plan_id: v2.selectedProviderPlanId ?? null,
          },
          internalPlan: v2.internalPlan,
          skuCode: v2.selectedProviderPlanId || sku || sysPlanId,
          extras: { countryCode, carrierCode, receiveAmount, receiveCurrency },
        })
        return NextResponse.json({
          success: true,
          order: { ...order, countryCode, carrierCode, carrierName, receiveAmount, receiveCurrency },
          lcr: { v2: true, decision: v2.decision, attempts: v2.attempts },
          hints: 'hints' in v2 ? v2.hints : undefined,
          message: 'Admin sandbox recharge processed via LCR v2',
        })
      }

      return NextResponse.json(
        { success: false, error: 'Unexpected LCR v2 response', hints: 'hints' in v2 ? v2.hints : undefined },
        { status: 500 },
      )
    }

    if (!skuCode || !sendAmount || !phoneNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const distributorRef = `TUG-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    const serviceFee = 0.5
    const totalAmount = Number(sendAmount) + serviceFee

    const routingCountryCode =
      typeof countryCode === 'string' && /^[A-Z]{2}$/.test(countryCode)
        ? countryCode
        : typeof body.countryIso === 'string' && /^[A-Z]{2}$/.test(body.countryIso)
          ? body.countryIso
          : 'IN'
    const normalizedOperator =
      typeof carrierCode === 'string' && carrierCode.includes('_')
        ? carrierCode.split('_')[0]
        : typeof carrierCode === 'string'
          ? carrierCode
          : ''
    const lcrDecision = await selectBestProviderWithObservability(
      routingCountryCode,
      normalizedOperator || '',
      String(skuCode),
      { timeoutMs: 4500, weighted: true },
    )
    if (!lcrDecision.selected) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active supported aggregator for this country/operator',
          lcr: lcrDecision,
        },
        { status: 400 },
      )
    }

    if (!isApiConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Recharge provider API is not configured. Configure Ding or enable LCR v2.',
          lcr: lcrDecision,
        },
        { status: 503 },
      )
    }

    const response = await sendTransfer({
      SkuCode: String(skuCode),
      SendValue: Number(sendAmount),
      AccountNumber: String(phoneNumber),
      DistributorRef: distributorRef,
      ValidateOnly: false,
    })

    if (response.ResultCode !== 1) {
      const errorMessage = response.ErrorCodes?.[0]?.Code || 'Unknown error'
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
          errorCodes: response.ErrorCodes,
        },
        { status: 400 },
      )
    }

    const transfer = response.TransferRecord
    const statusMap: Record<string, string> = {
      Submitted: 'processing',
      Processing: 'processing',
      Complete: 'completed',
      Failed: 'failed',
      Cancelled: 'failed',
    }

    const order = {
      id: distributorRef,
      phoneNumber: transfer.AccountNumber,
      countryCode,
      carrierCode,
      carrierName,
      skuCode,
      productName,
      sendAmount: transfer.Price.SendValue,
      sendCurrency: transfer.Price.SendCurrencyIso,
      receiveAmount: transfer.Price.ReceiveValue,
      receiveCurrency: transfer.Price.ReceiveCurrencyIso,
      serviceFee,
      totalAmount: transfer.Price.SendValue + serviceFee,
      status: statusMap[transfer.ProcessingState] || 'processing',
      providerRef: transfer.TransferId.TransferRef,
      distributorRef: transfer.TransferId.DistributorRef,
      receiptText: transfer.ReceiptText,
      createdAt: transfer.StartedUtc,
      completedAt: transfer.CompletedUtc,
      rewardPointsEarned: Math.floor(transfer.Price.SendValue),
    }

    return NextResponse.json({
      success: true,
      order,
      lcr: lcrDecision,
      message: 'Admin sandbox recharge processed successfully',
      totalAmount,
    })
  } catch (error) {
    console.error('Error processing recharge:', error)
    return NextResponse.json({ error: 'Failed to process recharge' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orderId = searchParams.get('orderId')

  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
  }

  const user = await getAuthenticatedRequestUser(request)
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (isLcrV2Enabled()) {
    try {
      let row = await dbFindRechargeByDistributorRef(orderId)
      if (!row) row = await dbFindRechargeById(orderId)
      if (row) {
        const plan = await dbGetInternalPlan(row.internal_plan_id)
        const order = lcrV2AttemptToApiOrder({
          attempt: row,
          internalPlan: plan ?? {},
          skuCode: row.selected_provider_plan_id || '',
          extras: {},
        })
        return NextResponse.json({
          orderId: row.distributor_ref,
          status: order.status,
          order,
          message: 'LCR v2 recharge status',
        })
      }
    } catch {
      return NextResponse.json({ error: 'Failed to load recharge status' }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Recharge order not found' }, { status: 404 })
}
