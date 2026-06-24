/** Normalized internal error codes for provider recharge failures. */
export const PROVIDER_RECHARGE_ERRORS = {
  PROVIDER_AMOUNT_OUT_OF_RANGE: 'PROVIDER_AMOUNT_OUT_OF_RANGE',
  PROVIDER_PRODUCT_NOT_FOUND: 'PROVIDER_PRODUCT_NOT_FOUND',
  PROVIDER_MAPPING_MISSING: 'PROVIDER_MAPPING_MISSING',
  PROVIDER_PRODUCT_INACTIVE: 'PROVIDER_PRODUCT_INACTIVE',
  PROVIDER_CURRENCY_MISMATCH: 'PROVIDER_CURRENCY_MISMATCH',
  PROVIDER_INVALID_PAYLOAD: 'PROVIDER_INVALID_PAYLOAD',
  PROVIDER_API_ERROR: 'PROVIDER_API_ERROR',
  PROVIDER_NOT_ACTIVE: 'PROVIDER_NOT_ACTIVE',
  PROVIDER_INVALID_PHONE: 'PROVIDER_INVALID_PHONE',
  PROVIDER_AMOUNT_MISSING: 'PROVIDER_AMOUNT_MISSING',
} as const

export type ProviderRechargeErrorCode =
  (typeof PROVIDER_RECHARGE_ERRORS)[keyof typeof PROVIDER_RECHARGE_ERRORS]

export type NormalizedProviderError = {
  code: ProviderRechargeErrorCode
  message: string
  providerCode?: string
  providerMessage?: string
}

function upper(v: unknown): string {
  return String(v ?? '').trim().toUpperCase()
}

/** Map provider-native error strings/codes to normalized internal codes. */
export function normalizeProviderError(input: {
  adapterKey: string
  providerCode?: string
  providerMessage?: string
  httpStatus?: number
}): NormalizedProviderError {
  const adapter = (input.adapterKey || '').toLowerCase()
  const msg = String(input.providerMessage ?? '')
  const msgLower = msg.toLowerCase()
  const providerCode = input.providerCode

  if (adapter === 'ding') {
    if (providerCode === 'ParameterOutOfRange' || msgLower.includes('parameteroutofrange')) {
      return {
        code: PROVIDER_RECHARGE_ERRORS.PROVIDER_AMOUNT_OUT_OF_RANGE,
        message: 'Recharge amount is outside the range allowed by Ding for this product',
        providerCode,
        providerMessage: msg,
      }
    }
    if (providerCode === 'InvalidSku' || msgLower.includes('invalid sku')) {
      return {
        code: PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_NOT_FOUND,
        message: 'Ding product SKU was not found or is no longer available',
        providerCode,
        providerMessage: msg,
      }
    }
  }

  if (adapter === 'valuetopup') {
    if (msgLower.includes('should be between') || msgLower.includes('out of range')) {
      return {
        code: PROVIDER_RECHARGE_ERRORS.PROVIDER_AMOUNT_OUT_OF_RANGE,
        message: 'Recharge amount is outside the denomination range allowed by ValueTopup',
        providerCode,
        providerMessage: msg,
      }
    }
  }

  if (adapter === 'dtone') {
    if (
      providerCode === '1000404' ||
      msgLower.includes('not found') ||
      input.httpStatus === 404
    ) {
      return {
        code: PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_NOT_FOUND,
        message: 'DT One product was not found or the mapping is stale',
        providerCode,
        providerMessage: msg,
      }
    }
  }

  if (input.httpStatus === 400) {
    return {
      code: PROVIDER_RECHARGE_ERRORS.PROVIDER_INVALID_PAYLOAD,
      message: msg || 'Provider rejected the recharge payload',
      providerCode,
      providerMessage: msg,
    }
  }

  return {
    code: PROVIDER_RECHARGE_ERRORS.PROVIDER_API_ERROR,
    message: msg || 'Provider API returned an error',
    providerCode,
    providerMessage: msg,
  }
}

/** Classify a pre-call validation failure reason into a normalized code. */
export function validationReasonToErrorCode(reason: string): ProviderRechargeErrorCode {
  const r = upper(reason)
  if (r.includes('AMOUNT') && r.includes('RANGE')) return PROVIDER_RECHARGE_ERRORS.PROVIDER_AMOUNT_OUT_OF_RANGE
  if (r.includes('AMOUNT') && r.includes('MISSING')) return PROVIDER_RECHARGE_ERRORS.PROVIDER_AMOUNT_MISSING
  if (r.includes('PRODUCT') && r.includes('INACTIVE')) return PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_INACTIVE
  if (r.includes('PRODUCT') && r.includes('NOT_FOUND')) return PROVIDER_RECHARGE_ERRORS.PROVIDER_PRODUCT_NOT_FOUND
  if (r.includes('MAPPING')) return PROVIDER_RECHARGE_ERRORS.PROVIDER_MAPPING_MISSING
  if (r.includes('CURRENCY')) return PROVIDER_RECHARGE_ERRORS.PROVIDER_CURRENCY_MISMATCH
  if (r.includes('PHONE')) return PROVIDER_RECHARGE_ERRORS.PROVIDER_INVALID_PHONE
  if (r.includes('PAYLOAD')) return PROVIDER_RECHARGE_ERRORS.PROVIDER_INVALID_PAYLOAD
  return PROVIDER_RECHARGE_ERRORS.PROVIDER_API_ERROR
}
