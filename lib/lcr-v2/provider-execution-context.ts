import type { ProviderPayloadStrategy } from '@/lib/routing/provider-payload-strategy'
import type { RoutingProviderCandidate } from '@/lib/routing/types'
import { formatDtoneMobileNumber } from '@/lib/dtone'

export type ProviderExecutionContext = {
  providerId: string
  providerPlanId: string
  adapterKey: string
  providerPayloadStrategy: ProviderPayloadStrategy
  provider_wholesale_amount: number
  provider_wholesale_currency: string
  destination_face_value: number
  destination_currency: string
  customer_payment_amount: number
  customer_payment_currency: string
  phoneDigits: string
  externalId: string
}

export type ProviderExecutionValidation = {
  valid: boolean
  missing: string[]
}

function finitePositive(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export function buildProviderExecutionContextFromCandidate(input: {
  candidate: RoutingProviderCandidate
  adapterKey: string
  phoneDigits: string
  externalId: string
  customer_payment_amount: number
  customer_payment_currency: string
}): ProviderExecutionContext {
  const wholesaleAmount =
    finitePositive(input.candidate.provider_wholesale_amount) ??
    finitePositive(input.candidate.price) ??
    0
  const wholesaleCurrency =
    (input.candidate.provider_wholesale_currency ?? input.candidate.currency ?? '').trim().toUpperCase() ||
    'EUR'
  const destinationFace =
    finitePositive(input.candidate.destination_face_value) ?? wholesaleAmount
  const destinationCurrency =
    (input.candidate.destination_currency ?? wholesaleCurrency).trim().toUpperCase() || wholesaleCurrency

  return {
    providerId: input.candidate.providerId,
    providerPlanId: input.candidate.providerPlanId ?? '',
    adapterKey: input.adapterKey.trim().toLowerCase(),
    providerPayloadStrategy: input.candidate.providerPayloadStrategy ?? 'PLAN_ID',
    provider_wholesale_amount: wholesaleAmount,
    provider_wholesale_currency: wholesaleCurrency,
    destination_face_value: destinationFace,
    destination_currency: destinationCurrency,
    customer_payment_amount: input.customer_payment_amount,
    customer_payment_currency: input.customer_payment_currency.trim().toUpperCase() || 'INR',
    phoneDigits: input.phoneDigits,
    externalId: input.externalId,
  }
}

export function validateProviderExecutionContext(ctx: ProviderExecutionContext): ProviderExecutionValidation {
  const missing: string[] = []
  if (!ctx.providerId?.trim()) missing.push('providerId')
  if (!ctx.providerPlanId?.trim()) missing.push('provider_plan_id')
  if (!ctx.adapterKey?.trim()) missing.push('adapterKey')
  if (!ctx.providerPayloadStrategy) missing.push('provider_payload_strategy')
  if (finitePositive(ctx.provider_wholesale_amount) == null) missing.push('provider_wholesale_amount')
  if (!ctx.provider_wholesale_currency?.trim()) missing.push('provider_wholesale_currency')
  if (finitePositive(ctx.destination_face_value) == null) missing.push('destination_face_value')
  if (!ctx.destination_currency?.trim()) missing.push('destination_currency')
  if (finitePositive(ctx.customer_payment_amount) == null) missing.push('customer_payment_amount')
  if (!ctx.customer_payment_currency?.trim()) missing.push('customer_payment_currency')
  return { valid: missing.length === 0, missing }
}

export function logProviderExecutionContext(ctx: ProviderExecutionContext, phase: string): void {
  console.log(
    '[Provider Execution]',
    `phase=${phase}`,
    `provider=${ctx.adapterKey}`,
    `planId=${ctx.providerPlanId}`,
    `strategy=${ctx.providerPayloadStrategy}`,
    `customer_payment=${ctx.customer_payment_amount} ${ctx.customer_payment_currency}`,
    `wholesale=${ctx.provider_wholesale_amount} ${ctx.provider_wholesale_currency}`,
    `destination_face=${ctx.destination_face_value} ${ctx.destination_currency}`,
  )
}

export type BuiltProviderPayload = {
  path?: string
  body: Record<string, unknown>
  logLine: string
}

function skuFromPlanId(providerPlanId: string): { sku: string; denomination: number | null } {
  const sep = providerPlanId.indexOf(':')
  if (sep > 0) {
    const sku = providerPlanId.slice(0, sep)
    const denomination = Number(providerPlanId.slice(sep + 1))
    return {
      sku,
      denomination: Number.isFinite(denomination) && denomination > 0 ? denomination : null,
    }
  }
  return { sku: providerPlanId, denomination: null }
}

/** Build provider HTTP body from strategy + execution context (no adapter-specific branches). */
export function buildProviderPayloadFromContext(ctx: ProviderExecutionContext): BuiltProviderPayload {
  const { sku, denomination } = skuFromPlanId(ctx.providerPlanId)
  const isPin = !ctx.phoneDigits

  switch (ctx.providerPayloadStrategy) {
    case 'WHOLESALE_AMOUNT':
      return {
        body: {
          SkuCode: ctx.providerPlanId,
          SendValue: ctx.provider_wholesale_amount,
          AccountNumber: ctx.phoneDigits,
          DistributorRef: ctx.externalId,
          ValidateOnly: false,
        },
        logLine: `WHOLESALE_AMOUNT SendValue=${ctx.provider_wholesale_amount} ${ctx.provider_wholesale_currency}`,
      }
    case 'FACE_VALUE':
    case 'DENOMINATION': {
      const amount = denomination ?? ctx.destination_face_value
      return {
        path: isPin ? '/transaction/pin' : '/transaction/topup',
        body: isPin
          ? { SkuId: Number(sku), CorrelationId: ctx.externalId.slice(0, 50) }
          : {
              SkuId: Number(sku),
              Amount: amount,
              Mobile: ctx.phoneDigits,
              CorrelationId: ctx.externalId.slice(0, 50),
            },
        logLine: `${ctx.providerPayloadStrategy} Amount=${amount} ${ctx.destination_currency}`,
      }
    }
    case 'SKU':
      return {
        path: isPin ? '/transaction/pin' : '/transaction/topup',
        body: isPin
          ? { SkuId: Number(sku), CorrelationId: ctx.externalId.slice(0, 50) }
          : {
              SkuId: Number(sku),
              Mobile: ctx.phoneDigits,
              CorrelationId: ctx.externalId.slice(0, 50),
            },
        logLine: `SKU SkuId=${sku}`,
      }
    case 'PLAN_ID':
    default:
      return {
        body: {
          external_id: ctx.externalId,
          product_id: Number(ctx.providerPlanId),
          auto_confirm: true,
          credit_party_identifier: {
            mobile_number: formatDtoneMobileNumber(ctx.phoneDigits),
          },
        },
        logLine: `PLAN_ID product_id=${ctx.providerPlanId}`,
      }
  }
}

export function builtInPathForStrategy(ctx: ProviderExecutionContext): string {
  if (ctx.providerPayloadStrategy === 'WHOLESALE_AMOUNT') return '/api/V1/SendTransfer'
  if (
    ctx.providerPayloadStrategy === 'FACE_VALUE' ||
    ctx.providerPayloadStrategy === 'DENOMINATION' ||
    ctx.providerPayloadStrategy === 'SKU'
  ) {
    return ctx.phoneDigits ? '/transaction/topup' : '/transaction/pin'
  }
  return '/v1/transactions'
}

export function builtInSuccessCheck(adapterKey: string, raw: unknown): boolean {
  const res = raw as Record<string, unknown>
  if (adapterKey === 'ding') return res?.ResultCode === 1
  if (adapterKey === 'valuetopup') {
    const status = String(res?.status || '').trim().toLowerCase()
    return (
      status === 'succesful' ||
      status === 'successful' ||
      status === 'accepted' ||
      status === 'processing' ||
      res?.responseCode === '000'
    )
  }
  if (adapterKey === 'dtone') {
    const statusId = (res?.status as { id?: number } | undefined)?.id
    return statusId !== 3 && statusId !== 9
  }
  const val = res?.status
  return ['success', 'successful', 'ok', true, 200, 1].includes(val as never) ||
    ['success', 'successful', 'ok', 'true', '200', '1'].includes(String(val))
}

export function builtInErrorMessage(adapterKey: string, raw: unknown): string | undefined {
  const res = raw as Record<string, unknown>
  if (adapterKey === 'ding' && res?.ResultCode !== 1) {
    const codes = res?.ErrorCodes as Array<{ Code?: string }> | undefined
    return codes?.[0]?.Code || 'DING_FAILED'
  }
  if (adapterKey === 'valuetopup') {
    const status = String(res?.status || '').trim().toLowerCase()
    if (status === 'failed' || res?.responseCode !== '000') {
      return String(res?.remarks || res?.responseMessage || 'VALUETOPUP_FAILED')
    }
  }
  if (adapterKey === 'dtone') {
    const errors = res?.errors as Array<{ code?: string | number; message?: string }> | undefined
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0]
      const code = first?.code != null ? String(first.code) : undefined
      const msg = first?.message
      if (code === '1000404') return msg || 'DTONE_PRODUCT_NOT_FOUND'
      if (msg) return code ? `[${code}] ${msg}` : msg
    }
    const statusId = (res?.status as { id?: number } | undefined)?.id
    if (statusId === 3 || statusId === 9) return 'DTONE_DECLINED'
  }
  return (res?.message as string) || (res?.error as string) || undefined
}

export function builtInProviderRef(adapterKey: string, raw: unknown, externalId: string): string {
  const res = raw as Record<string, unknown>
  if (adapterKey === 'ding') {
    const tr = res?.TransferRecord as { TransferId?: { TransferRef?: string } } | undefined
    return String(tr?.TransferId?.TransferRef ?? externalId)
  }
  if (adapterKey === 'valuetopup') {
    const payload = res?.payLoad as { transactionId?: string; refid?: string } | undefined
    return String(payload?.transactionId ?? payload?.refid ?? res?.refid ?? externalId)
  }
  return String(res?.id ?? externalId)
}
