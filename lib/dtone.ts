function readEnv(name: string): string | undefined {
  const v = process.env[name]
  return v?.trim() || undefined
}

export type DtoneCredentials = {
  apiKey: string
  apiSecret: string
  baseUrl: string
}

/** DT One REST API host when `DTONE_BASE_URL` is omitted (key + secret still required). */
export const DEFAULT_DTONE_BASE_URL = 'https://prepaid.dtone.com'

/**
 * Transaction create path on legacy prepaid.dtone.com host.
 * DVS hosts (preprod-dvs-api / dvs-api) use `/v1/sync/transactions` — see resolveDtoneTransactionPath().
 */
export const DTONE_LEGACY_TRANSACTION_PATH = '/v1/transactions'

/** DVS API sync transaction path (preprod-dvs-api.dtone.com, dvs-api.dtone.com). */
export const DTONE_DVS_SYNC_TRANSACTION_PATH = '/v1/sync/transactions'

/** @deprecated Use resolveDtoneTransactionPath(baseUrl) */
export const DTONE_TRANSACTION_PATH = DTONE_LEGACY_TRANSACTION_PATH

/** Official DT One transaction API reference (sync variant; payload shape matches async). */
export const DTONE_TRANSACTION_API_DOCS =
  'https://developers.dtone.com/reference/posttransactionsync'

/** E.164 mobile for credit_party_identifier.mobile_number. */
export function formatDtoneMobileNumber(phoneDigits: string): string {
  const trimmed = phoneDigits.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  return digits ? `+${digits}` : ''
}

/** Catalog list path (GET) — must use the same base URL as recharge. */
export const DTONE_PRODUCTS_PATH = '/v1/products'

function dtoneHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.toLowerCase()
  } catch {
    return baseUrl.trim().toLowerCase()
  }
}

/** True for Digital Value Services API hosts (not legacy prepaid.dtone.com). */
export function isDtoneDvsApiHost(baseUrl: string): boolean {
  const host = dtoneHost(baseUrl)
  return host === 'dvs-api.dtone.com' || host === 'preprod-dvs-api.dtone.com'
}

/**
 * Resolve transaction POST path for a DT One base URL.
 * - DVS API: POST /v1/sync/transactions (with auto_confirm for one-step recharge)
 * - Legacy prepaid.dtone.com: POST /v1/transactions
 */
export function resolveDtoneTransactionPath(baseUrl: string): string {
  return isDtoneDvsApiHost(baseUrl)
    ? DTONE_DVS_SYNC_TRANSACTION_PATH
    : DTONE_LEGACY_TRANSACTION_PATH
}

/** Resolve catalog base URL from env (bootstrap / connector fallback). */
export function resolveDtoneCatalogBaseUrl(providerBaseUrl?: string | null): string {
  return (providerBaseUrl?.trim() || readEnv('DTONE_BASE_URL') || DEFAULT_DTONE_BASE_URL).trim()
}

/** Parse required_credit_party_identifier_fields from DT One product raw JSON. */
export function extractDtoneRequiredCreditPartyFields(rawJson: unknown): string[][] {
  const raw = rawJson as Record<string, unknown> | null | undefined
  const fields = raw?.required_credit_party_identifier_fields
  if (!Array.isArray(fields) || fields.length === 0) {
    return [['mobile_number']]
  }
  return fields
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((f) => String(f)))
    .filter((row) => row.length > 0)
}

/** Validate payload credit_party_identifier against product required fields. */
export function validateDtoneCreditPartyPayload(
  rawJson: unknown,
  payload: Record<string, unknown>,
): string | null {
  const requiredGroups = extractDtoneRequiredCreditPartyFields(rawJson)
  const cpi = payload.credit_party_identifier as Record<string, unknown> | undefined
  if (!cpi || typeof cpi !== 'object') {
    return 'credit_party_identifier is required for this DT One product'
  }

  for (const group of requiredGroups) {
    let groupSatisfied = false
    for (const field of group) {
      const val = cpi[field]
      if (field === 'mobile_number') {
        const mobile = formatDtoneMobileNumber(String(val ?? ''))
        if (mobile.replace(/\D/g, '').length >= 8) {
          groupSatisfied = true
          break
        }
      } else if (val != null && String(val).trim() !== '') {
        groupSatisfied = true
        break
      }
    }
    if (!groupSatisfied) {
      const label = group.join(' or ')
      return `Missing required credit_party_identifier field(s): ${label}`
    }
  }
  return null
}

export type DtoneProductIdSourceCheck = {
  providerPlanId: string
  productId: number
  systemPlanId?: string | null
  destinationFaceValue?: number
  wholesaleAmount?: number
}

/** Ensure product_id is sourced from plan_mappings.provider_plan_id, not system plan or amounts. */
export function assertDtoneProductIdSource(input: DtoneProductIdSourceCheck): {
  valid: boolean
  reason?: string
} {
  const productId = input.productId
  const providerPlanId = input.providerPlanId.trim()

  if (!providerPlanId) {
    return { valid: false, reason: 'provider_plan_id is missing' }
  }
  if (!Number.isFinite(productId) || productId <= 0) {
    return {
      valid: false,
      reason: 'product_id must be a positive integer from plan_mappings.provider_plan_id',
    }
  }
  if (String(productId) !== providerPlanId && Number(providerPlanId) !== productId) {
    return {
      valid: false,
      reason: `product_id ${productId} does not match provider_plan_id ${providerPlanId}`,
    }
  }

  if (input.systemPlanId) {
    const sys = String(input.systemPlanId).trim()
    if (sys && (sys === String(productId) || sys === providerPlanId)) {
      return { valid: false, reason: 'product_id must not be derived from system_plan.id' }
    }
  }

  const dest = input.destinationFaceValue
  if (dest != null && Number.isFinite(dest) && Math.round(dest) === productId) {
    return {
      valid: false,
      reason: 'product_id must not be derived from destination.amount or destination face value',
    }
  }

  const wholesale = input.wholesaleAmount
  if (wholesale != null && Number.isFinite(wholesale) && wholesale === productId) {
    return {
      valid: false,
      reason: 'product_id must not be derived from wholesale or recharge amount',
    }
  }

  return { valid: true }
}

export type DtoneApiError = {
  httpStatus?: number
  providerCode?: string
  providerMessage?: string
  rawBody?: unknown
}

export function parseDtoneApiErrorBody(body: unknown, httpStatus?: number): DtoneApiError {
  const raw = body as Record<string, unknown> | null | undefined
  const errors = raw?.errors as Array<{ code?: string | number; message?: string }> | undefined
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0]
    return {
      httpStatus,
      providerCode: first?.code != null ? String(first.code) : undefined,
      providerMessage: first?.message,
      rawBody: body,
    }
  }
  return {
    httpStatus,
    providerMessage:
      (typeof raw?.message === 'string' ? raw.message : undefined) ||
      (typeof raw?.error === 'string' ? raw.error : undefined),
    rawBody: body,
  }
}

/** Credentials from env only (used for bootstrap + default connector path). */
export function getDtoneCredentialsFromEnv(): DtoneCredentials | null {
  const apiKey = readEnv('DTONE_API_KEY')
  const apiSecret = readEnv('DTONE_API_SECRET')
  if (!apiKey || !apiSecret) return null
  const baseUrl = readEnv('DTONE_BASE_URL') || DEFAULT_DTONE_BASE_URL
  return { apiKey, apiSecret, baseUrl }
}

export type DtoneCredentialInput = {
  apiKey?: string
  apiSecret?: string
  baseUrl?: string
}

export type DtoneProductsQuery = {
  countryIsoCode?: string
  page?: number
  perPage?: number
}

export type DtoneProductsPage = {
  items: unknown[]
  page: number
  totalPages: number
  total: number
}

function resolveDtoneCredentials(override?: DtoneCredentialInput): DtoneCredentials {
  const apiKey = override?.apiKey?.trim() || readEnv('DTONE_API_KEY')
  const apiSecret = override?.apiSecret?.trim() || readEnv('DTONE_API_SECRET')
  const baseUrl = (override?.baseUrl?.trim() || readEnv('DTONE_BASE_URL') || DEFAULT_DTONE_BASE_URL).trim()
  if (!apiKey || !apiSecret) {
    throw new Error(
      'DT One is not configured: set DTONE_API_KEY and DTONE_API_SECRET (optional DTONE_BASE_URL; defaults to prepaid.dtone.com), or store apiKey/apiSecret/baseUrl on the provider record.',
    )
  }
  return { apiKey, apiSecret, baseUrl }
}

export async function fetchDtoneProductsPage(
  creds?: DtoneCredentialInput,
  query?: DtoneProductsQuery,
): Promise<DtoneProductsPage> {
  const { apiKey, apiSecret, baseUrl } = resolveDtoneCredentials(creds)
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const params = new URLSearchParams()
  const page = Math.max(query?.page ?? 1, 1)
  const perPage = Math.min(Math.max(query?.perPage ?? 100, 1), 100)
  params.set('page', String(page))
  params.set('per_page', String(perPage))
  if (query?.countryIsoCode) params.set('country_iso_code', query.countryIsoCode.toUpperCase())

  const response = await fetch(`${baseUrl}/v1/products?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(`DTONE API Error: ${response.status}${bodyText ? ` - ${bodyText.slice(0, 500)}` : ''}`)
  }

  const items = (await response.json()) as unknown[]
  const total = Number(response.headers.get('X-Total') ?? items.length)
  const totalPages = Math.max(Number(response.headers.get('X-Total-Pages') ?? 1), 1)

  return { items, page, totalPages, total: Number.isFinite(total) ? total : items.length }
}

/** Fetch all product pages, optionally scoped to one or more ISO3 countries. */
export async function fetchAllDtoneProducts(
  creds?: DtoneCredentialInput,
  countries?: string[],
): Promise<unknown[]> {
  const countryList = (countries ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean)
  if (countryList.length) {
    const merged: unknown[] = []
    for (const countryIsoCode of countryList) {
      let page = 1
      let totalPages = 1
      do {
        const res = await fetchDtoneProductsPage(creds, { countryIsoCode, page, perPage: 100 })
        merged.push(...res.items)
        totalPages = res.totalPages
        page += 1
      } while (page <= totalPages)
    }
    return merged
  }

  const merged: unknown[] = []
  let page = 1
  let totalPages = 1
  do {
    const res = await fetchDtoneProductsPage(creds, { page, perPage: 100 })
    merged.push(...res.items)
    totalPages = res.totalPages
    page += 1
  } while (page <= totalPages)
  return merged
}

export async function fetchDtoneProducts(creds?: DtoneCredentialInput) {
  return fetchAllDtoneProducts(creds)
}

export async function fetchDtoneMobileNumberLookup(
  payload: { mobile_number: string },
  creds?: DtoneCredentialInput,
) {
  const { apiKey, apiSecret, baseUrl } = resolveDtoneCredentials(creds)
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

  const response = await fetch(`${baseUrl}/v1/lookup/mobile-number`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    throw new Error(`DTONE API Error: ${response.status}${bodyText ? ` - ${bodyText.slice(0, 500)}` : ''}`)
  }

  return response.json()
}

/** Create a DT One transaction (one-step when auto_confirm is true). */
export async function createDtoneTransaction(
  input: {
    external_id: string
    product_id: number
    credit_party_identifier: Record<string, string>
    auto_confirm?: boolean
  },
  creds?: DtoneCredentialInput,
) {
  const { apiKey, apiSecret, baseUrl } = resolveDtoneCredentials(creds)
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const transactionPath = resolveDtoneTransactionPath(baseUrl)

  const body = {
    external_id: input.external_id,
    product_id: input.product_id,
    auto_confirm: input.auto_confirm ?? true,
    credit_party_identifier: input.credit_party_identifier,
  }

  const response = await fetch(`${baseUrl}${transactionPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  })

  const textBody = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(`DTONE API Error: ${response.status}${textBody ? ` - ${textBody.slice(0, 800)}` : ''}`)
  }

  try {
    return JSON.parse(textBody) as unknown
  } catch {
    return textBody
  }
}
