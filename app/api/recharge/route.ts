import { NextResponse } from 'next/server'
import { isApiConfigured, sendTransfer } from '@/lib/api/ding-connect'
import { selectBestProviderWithObservability } from '@/lib/api/lcr-engine'
import { isLcrV2Enabled } from '@/lib/lcr-v2/flags'
import { processLcrV2Recharge, lcrV2AttemptToApiOrder } from '@/lib/lcr-v2/recharge'
import { dbFindRechargeByDistributorRef, dbFindRechargeById, dbGetInternalPlan } from '@/lib/lcr-v2/recharge-db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
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
      internalPlanId,
    } = body

    if (isLcrV2Enabled()) {
      const planId = typeof internalPlanId === 'string' ? internalPlanId.trim() : ''
      const sku = typeof skuCode === 'string' ? skuCode.trim() : ''
      if (!phoneNumber || (!planId && !sku)) {
        return NextResponse.json(
          { error: 'Missing required fields: phoneNumber and (internalPlanId or skuCode)' },
          { status: 400 }
        )
      }
      if (sendAmount == null || Number(sendAmount) <= 0) {
        return NextResponse.json({ error: 'sendAmount is required for LCR v2 recharge' }, { status: 400 })
      }

      const v2 = await processLcrV2Recharge(request, {
        internalPlanId: planId || undefined,
        skuCode: sku || undefined,
        phoneNumber,
        sendAmount: Number(sendAmount),
        countryCode,
        carrierCode,
        carrierName,
        productName,
        receiveCurrency,
        receiveAmount,
        idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
      })

      if (!v2.ok) {
        return NextResponse.json(
          {
            success: false,
            error: 'error' in v2 ? v2.error : 'LCR v2 failed',
            decision: 'decision' in v2 ? v2.decision : undefined,
            attempts: 'attempts' in v2 ? v2.attempts : undefined,
          },
          { status: v2.status }
        )
      }

      if ('cached' in v2 && v2.cached && v2.attempt) {
        const plan = await dbGetInternalPlan(v2.attempt.internal_plan_id)
        const skuOut = v2.attempt.selected_provider_plan_id || sku || planId
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
          message: 'Recharge completed (idempotent replay)',
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
          skuCode: v2.selectedProviderPlanId || sku,
          extras: { countryCode, carrierCode, receiveAmount, receiveCurrency },
        })
        return NextResponse.json({
          success: true,
          order: { ...order, countryCode, carrierCode, carrierName, receiveAmount, receiveCurrency },
          lcr: { v2: true, decision: v2.decision, attempts: v2.attempts },
          message: 'Recharge processed via LCR v2',
        })
      }

      return NextResponse.json({ success: false, error: 'Unexpected LCR v2 response' }, { status: 500 })
    }

    if (!skuCode || !sendAmount || !phoneNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const distributorRef = `TUG-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

    const serviceFee = 0.5
    const totalAmount = sendAmount + serviceFee

    const routingCountryCode =
      typeof countryCode === 'string' && /^[A-Z]{2}$/.test(countryCode)
        ? countryCode
        : typeof body.countryIso === 'string' && /^[A-Z]{2}$/.test(body.countryIso)
          ? body.countryIso
          : 'IN'
    const normalizedOperator =
      typeof carrierCode === 'string' && carrierCode.includes('_') ? carrierCode.split('_')[0] : carrierCode
    const lcrDecision = await selectBestProviderWithObservability(
      routingCountryCode,
      normalizedOperator || '',
      skuCode,
      { timeoutMs: 4500, weighted: true }
    )
    if (!lcrDecision.selected) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active supported aggregator for this country/operator',
          lcr: lcrDecision,
        },
        { status: 400 }
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
      SkuCode: skuCode,
      SendValue: sendAmount,
      AccountNumber: phoneNumber,
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
        { status: 400 }
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
      message: 'Recharge processed successfully',
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
