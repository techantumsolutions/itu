import { supabaseRest } from '@/lib/db/supabase-rest'
import { formatDtoneMobileNumber, validateDtoneCreditPartyPayload } from '@/lib/dtone'
import {
  isAmountWithinProviderRange,
  resolveProviderRechargeAmount,
  type ProviderRawPlanRow,
  type ResolvedProviderRechargeAmount,
} from '@/lib/lcr-v2/provider-recharge-amount'
import {
  PROVIDER_RECHARGE_ERRORS,
  validationReasonToErrorCode,
  type ProviderRechargeErrorCode,
} from '@/lib/lcr-v2/provider-recharge-errors'

function enc(v: string): string {
  return encodeURIComponent(v)
}

const RAW_PLAN_SELECT =
  'id,provider_id,provider_plan_id,amount,currency,destination_amount,destination_currency,catalog_status,raw_json,fetched_at'

export type ProviderRechargeValidationInput = {
  adapterKey: string
  providerId: string
  providerPlanId: string
  internalPlanId: string
  systemPlanId?: string | null
  phoneDigits: string
  requestedAmount?: number
  externalId?: string
  /** Pre-loaded raw plan to avoid duplicate DB reads */
  rawPlan?: ProviderRawPlanRow | null
  /** Skip phone validation (e.g. during LCR routing before checkout phone is known) */
  skipPhoneCheck?: boolean
}

export type ProviderRechargeValidationResult = {
  eligible: boolean
  reason?: string
  normalizedError?: ProviderRechargeErrorCode
  providerAmount: number | null
  providerCurrency: string | null
  amountResolution: ResolvedProviderRechargeAmount | null
  rawPlan: ProviderRawPlanRow | null
  payload: Record<string, unknown> | null
}

export type RechargeAttemptAuditLog = {
  provider: string
  adapterKey: string
  internal_plan_id: string
  system_plan_id?: string | null
  provider_plan_id: string
  mobile_number: string
  requested_amount?: number | null
  provider_amount: number | null
  provider_currency: string | null
  payload: Record<string, unknown> | null
  attempt_number?: number
  duration_ms?: number
  response?: unknown
  error?: string | null
  normalized_error?: ProviderRechargeErrorCode | null
  provider_error_code?: string | null
  provider_error_message?: string | null
}

export function rawPlanCacheKey(providerId: string, providerPlanId: string): string {
  return `${providerId}:${providerPlanId}`
}

/** Load latest provider_plans_raw row for a provider product. */
export async function loadProviderRawPlan(
  providerId: string,
  providerPlanId: string,
): Promise<ProviderRawPlanRow | null> {
  const res = await supabaseRest(
    `provider_plans_raw?provider_id=eq.${enc(providerId)}&provider_plan_id=eq.${enc(providerPlanId)}&select=${RAW_PLAN_SELECT}&order=fetched_at.desc&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as ProviderRawPlanRow[]
  return rows[0] ?? null
}

/** Batch-load latest raw plans for multiple provider mappings. */
export async function batchLoadProviderRawPlans(
  lookups: Array<{ providerId: string; providerPlanId: string }>,
): Promise<Map<string, ProviderRawPlanRow>> {
  const result = new Map<string, ProviderRawPlanRow>()
  const unique = new Map<string, { providerId: string; providerPlanId: string }>()
  for (const l of lookups) {
    if (!l.providerId || !l.providerPlanId) continue
    unique.set(rawPlanCacheKey(l.providerId, l.providerPlanId), l)
  }

  await Promise.all(
    [...unique.values()].map(async (lookup) => {
      const row = await loadProviderRawPlan(lookup.providerId, lookup.providerPlanId)
      if (row) result.set(rawPlanCacheKey(lookup.providerId, lookup.providerPlanId), row)
    }),
  )
  return result
}

function isRawPlanActive(rawPlan: ProviderRawPlanRow | null | undefined): boolean {
  if (!rawPlan) return false
  const status = String(rawPlan.catalog_status ?? 'ACTIVE').trim().toUpperCase()
  return status === 'ACTIVE' || status === ''
}

export function buildDingPayload(input: {
  providerPlanId: string
  phoneDigits: string
  externalId: string
  sendValue: number
}): Record<string, unknown> {
  return {
    SkuCode: input.providerPlanId,
    SendValue: input.sendValue,
    AccountNumber: input.phoneDigits,
    DistributorRef: input.externalId,
    ValidateOnly: false,
  }
}

export function buildValueTopupPayload(input: {
  providerPlanId: string
  phoneDigits: string
  externalId: string
  amount: number
}): Record<string, unknown> {
  const sep = input.providerPlanId.indexOf(':')
  const product = sep > 0 ? input.providerPlanId.slice(0, sep) : input.providerPlanId
  const isPin = !input.phoneDigits

  if (isPin) {
    return {
      SkuId: Number(product),
      CorrelationId: input.externalId.slice(0, 50),
    }
  }

  return {
    SkuId: Number(product),
    Amount: input.amount,
    Mobile: input.phoneDigits,
    CorrelationId: input.externalId.slice(0, 50),
  }
}

export function buildDtonePayload(input: {
  providerPlanId: string
  phoneDigits: string
  externalId: string
}): Record<string, unknown> {
  return {
    external_id: input.externalId,
    product_id: Number(input.providerPlanId),
    auto_confirm: true,
    credit_party_identifier: {
      mobile_number: formatDtoneMobileNumber(input.phoneDigits),
    },
  }
}

/** Build provider-specific API payload using resolved catalog amounts (never customer price). */
export function buildProviderRechargePayload(input: {
  adapterKey: string
  providerPlanId: string
  phoneDigits: string
  externalId: string
  amountResolution: ResolvedProviderRechargeAmount
}): { payload: Record<string, unknown> | null; error?: string } {
  const adapter = (input.adapterKey || '').toLowerCase()

  if (adapter === 'ding') {
    const sendValue = input.amountResolution.providerAmount
    if (sendValue == null || sendValue <= 0) {
      return { payload: null, error: 'Ding SendValue could not be resolved from catalog' }
    }
    return {
      payload: buildDingPayload({
        providerPlanId: input.providerPlanId,
        phoneDigits: input.phoneDigits,
        externalId: input.externalId,
        sendValue,
      }),
    }
  }

  if (adapter === 'valuetopup') {
    const amount = input.amountResolution.providerAmount
    if (amount == null || amount <= 0) {
      return { payload: null, error: 'ValueTopup face value could not be resolved from catalog' }
    }
    const skuPart = input.providerPlanId.split(':')[0]
    if (!Number.isFinite(Number(skuPart))) {
      return { payload: null, error: 'ValueTopup SkuId is invalid' }
    }
    return {
      payload: buildValueTopupPayload({
        providerPlanId: input.providerPlanId,
        phoneDigits: input.phoneDigits,
        externalId: input.externalId,
        amount,
      }),
    }
  }

  if (adapter === 'dtone') {
    const productId = Number(input.providerPlanId)
    if (!Number.isFinite(productId) || productId <= 0) {
      return { payload: null, error: 'DT One product_id is invalid' }
    }
    return {
      payload: buildDtonePayload({
        providerPlanId: input.providerPlanId,
        phoneDigits: input.phoneDigits,
        externalId: input.externalId,
      }),
    }
  }

  const amount = input.amountResolution.providerAmount
  return {
    payload: {
      external_id: input.externalId,
      product_id: input.providerPlanId,
      recipient_phone: input.phoneDigits,
      amount: amount ?? undefined,
    },
  }
}

/**
 * Pre-validate a provider recharge attempt.
 * Uses catalog raw plan data to resolve the correct provider amount — never customer price.
 */
export async function validateProviderRecharge(
  input: ProviderRechargeValidationInput,
): Promise<ProviderRechargeValidationResult> {
  const rawPlan =
    input.rawPlan !== undefined
      ? input.rawPlan
      : await loadProviderRawPlan(input.providerId, input.providerPlanId)

  return evaluateProviderRechargeEligibility({ ...input, rawPlan })
}

/** Synchronous eligibility check when raw plan is already loaded (routing batch). */
export function evaluateProviderRechargeEligibility(
  input: ProviderRechargeValidationInput & { rawPlan: ProviderRawPlanRow | null | undefined },
): ProviderRechargeValidationResult {
  const rawPlan = input.rawPlan ?? null

  const adapter = (input.adapterKey || '').toLowerCase()
  const phoneDigits = (input.phoneDigits || '').replace(/\D/g, '')

  if (!input.providerPlanId?.trim()) {
    return ineligible('Provider plan mapping is missing', PROVIDER_RECHARGE_ERRORS.PROVIDER_MAPPING_MISSING)
  }

  if (!input.skipPhoneCheck && (adapter !== 'valuetopup' || phoneDigits)) {
    if (phoneDigits.length < 8) {
      return ineligible('Mobile number is invalid', PROVIDER_RECHARGE_ERRORS.PROVIDER_INVALID_PHONE)
    }
  }

  if (!rawPlan) {
    return ineligible(
      'Provider product not found in catalog — mapping may be stale',
      PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_NOT_FOUND,
    )
  }

  if (!isRawPlanActive(rawPlan)) {
    return ineligible(
      `Provider product is not active (status: ${rawPlan.catalog_status ?? 'unknown'})`,
      PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_INACTIVE,
      rawPlan,
    )
  }

  const amountResolution = resolveProviderRechargeAmount({
    adapterKey: adapter,
    rawPlan,
    providerPlanId: input.providerPlanId,
  })

  if (adapter === 'dtone') {
    const productId = Number(input.providerPlanId)
    if (!Number.isFinite(productId) || productId <= 0) {
      return ineligible(
        'DT One product_id is invalid',
        PROVIDER_RECHARGE_ERRORS.PROVIDER_INVALID_PAYLOAD,
        rawPlan,
        amountResolution,
      )
    }
    const built = buildProviderRechargePayload({
      adapterKey: adapter,
      providerPlanId: input.providerPlanId,
      phoneDigits,
      externalId: input.externalId ?? 'validate',
      amountResolution,
    })
    if (!built.payload) {
      return ineligible(built.error ?? 'Invalid DT One payload', PROVIDER_RECHARGE_ERRORS.PROVIDER_INVALID_PAYLOAD, rawPlan, amountResolution)
    }
    const creditPartyError = validateDtoneCreditPartyPayload(rawPlan.raw_json, built.payload)
    if (creditPartyError) {
      return ineligible(creditPartyError, PROVIDER_RECHARGE_ERRORS.PROVIDER_INVALID_PAYLOAD, rawPlan, amountResolution)
    }
    return eligible(rawPlan, amountResolution, built.payload)
  }

  const { providerAmount, providerCurrency, minAmount, maxAmount, amountField } = amountResolution

  if (amountField !== 'none' && (providerAmount == null || providerAmount <= 0)) {
    return ineligible(
      'Provider recharge amount could not be resolved from catalog',
      PROVIDER_RECHARGE_ERRORS.PROVIDER_AMOUNT_MISSING,
      rawPlan,
      amountResolution,
    )
  }

  if (
    amountField !== 'none' &&
    minAmount != null &&
    maxAmount != null &&
    !isAmountWithinProviderRange(providerAmount, minAmount, maxAmount)
  ) {
    return ineligible(
      `Amount ${providerAmount} ${providerCurrency ?? ''} is outside allowed range ${minAmount}–${maxAmount}`,
      PROVIDER_RECHARGE_ERRORS.PROVIDER_AMOUNT_OUT_OF_RANGE,
      rawPlan,
      amountResolution,
    )
  }

  if (!providerCurrency && amountField !== 'none') {
    return ineligible(
      'Provider currency could not be resolved from catalog',
      PROVIDER_RECHARGE_ERRORS.PROVIDER_CURRENCY_MISMATCH,
      rawPlan,
      amountResolution,
    )
  }

  const built = buildProviderRechargePayload({
    adapterKey: adapter,
    providerPlanId: input.providerPlanId,
    phoneDigits,
    externalId: input.externalId ?? 'validate',
    amountResolution,
  })

  if (!built.payload) {
    return ineligible(
      built.error ?? 'Could not build provider payload',
      PROVIDER_RECHARGE_ERRORS.PROVIDER_INVALID_PAYLOAD,
      rawPlan,
      amountResolution,
    )
  }

  return eligible(rawPlan, amountResolution, built.payload)
}

function ineligible(
  reason: string,
  normalizedError: ProviderRechargeErrorCode,
  rawPlan: ProviderRawPlanRow | null = null,
  amountResolution: ResolvedProviderRechargeAmount | null = null,
): ProviderRechargeValidationResult {
  return {
    eligible: false,
    reason,
    normalizedError: normalizedError ?? validationReasonToErrorCode(reason),
    providerAmount: amountResolution?.providerAmount ?? null,
    providerCurrency: amountResolution?.providerCurrency ?? null,
    amountResolution,
    rawPlan,
    payload: null,
  }
}

function eligible(
  rawPlan: ProviderRawPlanRow,
  amountResolution: ResolvedProviderRechargeAmount,
  payload: Record<string, unknown>,
): ProviderRechargeValidationResult {
  return {
    eligible: true,
    providerAmount: amountResolution.providerAmount,
    providerCurrency: amountResolution.providerCurrency,
    amountResolution,
    rawPlan,
    payload,
  }
}

/** Structured console log for every provider recharge attempt. */
export function logRechargeAttempt(audit: RechargeAttemptAuditLog): void {
  console.log('[RECHARGE_ATTEMPT]', JSON.stringify(audit))
}
