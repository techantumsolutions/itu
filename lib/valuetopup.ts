import crypto from 'crypto'

function readEnv(name: string): string | undefined {
  const v = process.env[name]
  return v?.trim() || undefined
}

/** Value Topup / IIMMPACT-style API base (includes `/api/v2`). */
export const DEFAULT_VALUE_TOPUP_BASE_URL = 'https://sandbox.valuetopup.com/api/v2'

export type ValuetopupCredentials = {
  apiKey: string
  hmacSecret: string
  baseUrl: string
}

export type ValuetopupCredentialInput = {
  apiKey?: string
  apiSecret?: string
  hmacSecret?: string
  baseUrl?: string
}

export type ValuetopupCatalogProduct = {
  code: string
  name: string
  note?: string | null
  image_url?: string | null
  processing_time?: string
  is_active?: boolean
  denomination?: string | null
  denomination_currency?: string | null
  denomination_unit_price?: number | null
  fields?: unknown[]
  fulfillment?: Record<string, unknown>
  pricing?: {
    unit_price?: string
    currency?: string
    discount?: { type?: string; value?: string }
    price_adjustment?: unknown
    has_loss_risk?: boolean
  }
  min_amount?: unknown
  max_amount?: unknown
}

export type ValuetopupCatalogResponse = {
  last_updated?: string
  tree?: unknown
  products?: Record<string, ValuetopupCatalogProduct>
}

export type ValuetopupTopupInput = {
  refid: string
  product: string
  account: string
  amount: number | string
  remarks?: string
  extras?: Record<string, string>
}

export function getValuetopupCredentialsFromEnv(): ValuetopupCredentials | null {
  const apiKey = readEnv('VALUE_TOPUP_API_KEY')
  const hmacSecret = readEnv('VALUE_TOPUP_HMAC_SECRET') || readEnv('VALUE_TOPUP_API_SECRET')
  if (!apiKey || !hmacSecret) return null
  const baseUrl = readEnv('VALUE_TOPUP_BASE_URL') || readEnv('VALUE_TOPUP_PROD_BASE_URL') || DEFAULT_VALUE_TOPUP_BASE_URL
  return { apiKey, hmacSecret, baseUrl }
}

function resolveValuetopupCredentials(override?: ValuetopupCredentialInput): ValuetopupCredentials {
  const apiKey = override?.apiKey?.trim() || readEnv('VALUE_TOPUP_API_KEY')
  const hmacSecret =
    override?.hmacSecret?.trim() ||
    override?.apiSecret?.trim() ||
    readEnv('VALUE_TOPUP_HMAC_SECRET') ||
    readEnv('VALUE_TOPUP_API_SECRET')
  const baseUrl = (
    override?.baseUrl?.trim() ||
    readEnv('VALUE_TOPUP_BASE_URL') ||
    readEnv('VALUE_TOPUP_PROD_BASE_URL') ||
    DEFAULT_VALUE_TOPUP_BASE_URL
  ).replace(/\/$/, '')
  if (!apiKey || !hmacSecret) {
    throw new Error(
      'Value Topup is not configured: set VALUE_TOPUP_API_KEY and VALUE_TOPUP_HMAC_SECRET (optional VALUE_TOPUP_BASE_URL), or store apiKey/apiSecret on the provider record.',
    )
  }
  return { apiKey, hmacSecret, baseUrl }
}

export function signValuetopupRequest(input: {
  method: string
  query?: string
  body?: string
  hmacSecret: string
}): { timestamp: string; nonce: string; signature: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = `req-${timestamp}-${crypto.randomBytes(8).toString('hex')}`
  const bodyHash = crypto.createHash('sha256').update(input.body ?? '').digest('base64')
  const query = (input.query ?? '').replace(/^\?/, '')
  const canonical = `v1:${timestamp}:${nonce}:${input.method.toUpperCase()}:${query}:${bodyHash}`
  const key = Buffer.from(input.hmacSecret, 'base64')
  const sig = crypto.createHmac('sha256', key).update(canonical).digest('base64')
  return { timestamp, nonce, signature: `v1=${sig}` }
}

async function valuetopupFetch<T>(
  creds: ValuetopupCredentials,
  input: { method: string; path: string; query?: string; body?: Record<string, unknown> },
): Promise<T> {
  const query = (input.query ?? '').replace(/^\?/, '')
  const bodyJson = input.body ? JSON.stringify(input.body) : ''

  const url = query ? `${creds.baseUrl}${input.path}?${query}` : `${creds.baseUrl}${input.path}`
  const auth = Buffer.from(`${creds.apiKey}:${creds.hmacSecret}`).toString('base64')
  
  const response = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: bodyJson || undefined,
    cache: 'no-store',
  })

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    throw new Error(`Value Topup API Error: ${response.status}${text ? ` - ${text.slice(0, 500)}` : ''}`)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Value Topup API returned invalid JSON')
  }
}

export async function fetchValuetopupCatalog(
  creds?: ValuetopupCredentialInput,
  query?: { productCode?: string; includeInactive?: boolean },
): Promise<any> {
  const resolved = resolveValuetopupCredentials(creds)
  const params = new URLSearchParams()
  // Note: API v2 uses /catalog/skus
  const q = params.toString()
  return valuetopupFetch<any>(resolved, {
    method: 'GET',
    path: '/catalog/skus',
    query: q,
  })
}

export async function createValuetopupTransaction(
  input: { refid: string; product: string | number; account?: string; amount?: number; remarks?: string; extras?: Record<string, string> },
  creds?: ValuetopupCredentialInput,
): Promise<Record<string, unknown>> {
  const resolved = resolveValuetopupCredentials(creds)
  const skuId = Number(input.product)
  const isPin = !input.account
  const path = isPin ? '/transaction/pin' : '/transaction/topup'

  const body: Record<string, unknown> = isPin
    ? {
        SkuId: skuId,
        CorrelationId: input.refid,
      }
    : {
        SkuId: skuId,
        Amount: input.amount,
        Mobile: input.account,
        CorrelationId: input.refid,
      }

  const res = await valuetopupFetch<any>(resolved, {
    method: 'POST',
    path,
    body,
  })

  return {
    status: res.responseCode === '000' ? 'successful' : 'failed',
    refid: res.payLoad?.transactionId ?? res.payLoad?.refid ?? input.refid,
    remarks: res.responseMessage ?? '',
    ...res,
  }
}

export async function fetchValuetopupBalance(creds?: ValuetopupCredentialInput): Promise<unknown> {
  const resolved = resolveValuetopupCredentials(creds)
  return valuetopupFetch(resolved, { method: 'GET', path: '/wallet/balance' })
}
