/**
 * Lightweight provider pre-validation before LCR recharge attempts.
 * Uses ProviderExecutionContext — does not use customer payment for provider payloads.
 */
import { getBalance, isApiConfigured } from '@/lib/api/ding-connect'
import { loadProviderRawPlan } from '@/lib/lcr-v2/provider-recharge-validation'
import type { ProviderRawPlanRow } from '@/lib/lcr-v2/provider-recharge-amount'
import { isAmountWithinProviderRange } from '@/lib/lcr-v2/provider-recharge-amount'
import {
  logProviderExecutionContext,
  type ProviderExecutionContext,
  validateProviderExecutionContext,
} from '@/lib/lcr-v2/provider-execution-context'
import type { ProviderPayloadStrategy } from '@/lib/routing/provider-payload-strategy'
import { checkProviderWalletBalance, DING_INSUFFICIENT_BALANCE_LOG } from '@/lib/lcr-v2/provider-balance-check'

export type ProviderPreValidationInput = {
  executionContext: ProviderExecutionContext
  /** Optional `lcr_providers` row for per-provider wallet balance checks. */
  providerRow?: Record<string, unknown> | null
}

export type ProviderValidationDebug = {
  provider: string
  providerPlanId?: string
  provider_payload_strategy?: ProviderPayloadStrategy
  provider_wholesale_amount?: number | null
  provider_wholesale_currency?: string | null
  destination_face_value?: number | null
  destination_currency?: string | null
  customer_payment_amount?: number | null
  customer_payment_currency?: string | null
  providerMin?: number | null
  providerMax?: number | null
  providerPlanExists?: boolean
  validation: boolean
}

export type ProviderPreValidationResult = {
  eligible: boolean
  logMessage?: string
  reason?: string
  debug?: ProviderValidationDebug
}

function finiteAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

export function valueTopupFaceValueFromRaw(
  rawPlan: Pick<ProviderRawPlanRow, 'raw_json' | 'destination_amount' | 'amount'> | null | undefined,
): number | null {
  if (!rawPlan) return null
  const raw = (rawPlan.raw_json ?? {}) as Record<string, unknown>
  const minBlock = raw.min as Record<string, unknown> | undefined
  return (
    finiteAmount(minBlock?.faceValue) ??
    finiteAmount(rawPlan.destination_amount) ??
    finiteAmount(rawPlan.amount)
  )
}

export function valueTopupDenominationBoundsFromRaw(
  rawPlan: Pick<ProviderRawPlanRow, 'raw_json'> | null | undefined,
): { min: number | null; max: number | null } {
  if (!rawPlan) return { min: null, max: null }
  const raw = (rawPlan.raw_json ?? {}) as Record<string, unknown>
  const minBlock = raw.min as Record<string, unknown> | undefined
  const maxBlock = raw.max as Record<string, unknown> | undefined
  const min = finiteAmount(minBlock?.faceValue)
  const max = finiteAmount(maxBlock?.faceValue) ?? min
  return { min, max }
}

export function resolveValueTopupCatalogAmount(input: {
  providerPlanId: string
  rawPlan: Pick<ProviderRawPlanRow, 'raw_json' | 'destination_amount' | 'amount'> | null
}): number | null {
  const sep = input.providerPlanId.indexOf(':')
  const amountFromId = sep > 0 ? finiteAmount(input.providerPlanId.slice(sep + 1)) : null
  if (amountFromId != null) return amountFromId
  return valueTopupFaceValueFromRaw(input.rawPlan)
}

function isRawPlanActive(catalogStatus: string | null | undefined): boolean {
  const status = String(catalogStatus ?? 'ACTIVE').trim().toUpperCase()
  return status === 'ACTIVE' || status === ''
}

function logValidation(debug: ProviderValidationDebug): void {
  const parts = Object.entries(debug)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  console.log('[LCR Validation]', parts)
}

async function validateWholesaleStrategy(ctx: ProviderExecutionContext): Promise<ProviderPreValidationResult> {
  const debug: ProviderValidationDebug = {
    provider: ctx.adapterKey,
    providerPlanId: ctx.providerPlanId,
    provider_payload_strategy: ctx.providerPayloadStrategy,
    provider_wholesale_amount: ctx.provider_wholesale_amount,
    provider_wholesale_currency: ctx.provider_wholesale_currency,
    destination_face_value: ctx.destination_face_value,
    destination_currency: ctx.destination_currency,
    customer_payment_amount: ctx.customer_payment_amount,
    customer_payment_currency: ctx.customer_payment_currency,
    validation: true,
  }

  if (!isApiConfigured()) {
    logValidation(debug)
    return { eligible: true, debug }
  }

  try {
    const balance = await getBalance()
    if (balance.ResultCode === 1 && balance.Balance < ctx.provider_wholesale_amount) {
      debug.validation = false
      logValidation(debug)
      return {
        eligible: false,
        logMessage: DING_INSUFFICIENT_BALANCE_LOG,
        reason: 'insufficient_balance',
        debug,
      }
    }
  } catch {
    // proceed — detailed check in checkProviderWalletBalance
  }

  logValidation(debug)
  return { eligible: true, debug }
}

async function validateFaceValueStrategy(ctx: ProviderExecutionContext): Promise<ProviderPreValidationResult> {
  const rawPlan = await loadProviderRawPlan(ctx.providerId, ctx.providerPlanId)
  const { min: providerMin, max: providerMax } = valueTopupDenominationBoundsFromRaw(rawPlan)
  const catalogAmount =
    resolveValueTopupCatalogAmount({
      providerPlanId: ctx.providerPlanId,
      rawPlan,
    }) ?? ctx.destination_face_value

  const debug: ProviderValidationDebug = {
    provider: ctx.adapterKey,
    providerPlanId: ctx.providerPlanId,
    provider_payload_strategy: ctx.providerPayloadStrategy,
    provider_wholesale_amount: ctx.provider_wholesale_amount,
    provider_wholesale_currency: ctx.provider_wholesale_currency,
    destination_face_value: catalogAmount,
    destination_currency: ctx.destination_currency,
    customer_payment_amount: ctx.customer_payment_amount,
    customer_payment_currency: ctx.customer_payment_currency,
    providerMin,
    providerMax,
    providerPlanExists: Boolean(rawPlan),
    validation: true,
  }

  if (!rawPlan) {
    debug.validation = false
    logValidation(debug)
    return {
      eligible: false,
      logMessage: '[LCR] Provider skipped: catalog product not found',
      reason: 'missing_catalog_product',
      debug,
    }
  }

  if (catalogAmount == null || catalogAmount <= 0) {
    debug.validation = false
    logValidation(debug)
    return {
      eligible: false,
      logMessage: '[LCR] Provider skipped: destination face value missing',
      reason: 'invalid_destination_face_value',
      debug,
    }
  }

  if (providerMin != null && providerMax != null) {
    if (!isAmountWithinProviderRange(catalogAmount, providerMin, providerMax)) {
      debug.validation = false
      logValidation(debug)
      return {
        eligible: false,
        logMessage: '[LCR] Provider skipped: denomination outside allowed range',
        reason: 'amount_out_of_range',
        debug,
      }
    }
  }

  logValidation(debug)
  return { eligible: true, debug }
}

async function validatePlanIdStrategy(ctx: ProviderExecutionContext): Promise<ProviderPreValidationResult> {
  const debug: ProviderValidationDebug = {
    provider: ctx.adapterKey,
    providerPlanId: ctx.providerPlanId,
    provider_payload_strategy: ctx.providerPayloadStrategy,
    provider_wholesale_amount: ctx.provider_wholesale_amount,
    provider_wholesale_currency: ctx.provider_wholesale_currency,
    destination_face_value: ctx.destination_face_value,
    destination_currency: ctx.destination_currency,
    customer_payment_amount: ctx.customer_payment_amount,
    customer_payment_currency: ctx.customer_payment_currency,
    providerPlanExists: false,
    validation: true,
  }

  if (!ctx.providerPlanId?.trim()) {
    debug.validation = false
    logValidation(debug)
    return {
      eligible: false,
      logMessage: '[LCR] Provider skipped: missing provider_plan_id',
      reason: 'mapping_missing',
      debug,
    }
  }

  const productId = Number(ctx.providerPlanId)
  if (!Number.isFinite(productId) || productId <= 0) {
    const rawPlan = await loadProviderRawPlan(ctx.providerId, ctx.providerPlanId)
    debug.providerPlanExists = Boolean(rawPlan)
    if (!rawPlan || !isRawPlanActive(rawPlan.catalog_status)) {
      debug.validation = false
      logValidation(debug)
      return {
        eligible: false,
        logMessage: '[LCR] Provider skipped: stale or missing product mapping',
        reason: 'product_not_found',
        debug,
      }
    }
    logValidation(debug)
    return { eligible: true, debug }
  }

  const rawPlan = await loadProviderRawPlan(ctx.providerId, ctx.providerPlanId)
  debug.providerPlanExists = Boolean(rawPlan)
  if (!rawPlan || !isRawPlanActive(rawPlan.catalog_status)) {
    debug.validation = false
    logValidation(debug)
    return {
      eligible: false,
      logMessage: '[LCR] Provider skipped: stale or missing product mapping',
      reason: 'product_not_found',
      debug,
    }
  }

  logValidation(debug)
  return { eligible: true, debug }
}

export async function providerPreValidation(
  input: ProviderPreValidationInput,
): Promise<ProviderPreValidationResult> {
  const ctx = input.executionContext
  logProviderExecutionContext(ctx, 'pre-validation')

  const structural = validateProviderExecutionContext(ctx)
  if (!structural.valid) {
    return {
      eligible: false,
      logMessage: `[LCR] Provider skipped: missing fields ${structural.missing.join(', ')}`,
      reason: 'execution_context_invalid',
    }
  }

  const balanceCheck = await checkProviderWalletBalance({
    ctx,
    providerRow: input.providerRow,
  })
  if (balanceCheck.checked && !balanceCheck.sufficient) {
    const logMessage =
      balanceCheck.logMessage ??
      `[LCR] Provider skipped: insufficient provider balance (need ${balanceCheck.requiredAmount}, have ${balanceCheck.availableBalance})`
    console.log(logMessage)
    return {
      eligible: false,
      logMessage,
      reason: balanceCheck.reason ?? 'insufficient_balance',
    }
  }

  let result: ProviderPreValidationResult
  switch (ctx.providerPayloadStrategy) {
    case 'WHOLESALE_AMOUNT':
      result = await validateWholesaleStrategy(ctx)
      break
    case 'FACE_VALUE':
    case 'DENOMINATION':
    case 'SKU':
      result = await validateFaceValueStrategy(ctx)
      break
    case 'PLAN_ID':
    default:
      result = await validatePlanIdStrategy(ctx)
      break
  }

  if (!result.eligible && result.logMessage) {
    console.log(result.logMessage)
  }

  return result
}

export function isDingInsufficientBalance(errorCode?: string, errorMessage?: string): boolean {
  const code = String(errorCode ?? '').trim()
  const msg = String(errorMessage ?? '').trim().toLowerCase()
  return code === 'InsufficientBalance' || msg.includes('insufficientbalance')
}

export { DING_INSUFFICIENT_BALANCE_LOG } from '@/lib/lcr-v2/provider-balance-check'
