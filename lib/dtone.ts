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

  const body = {
    external_id: input.external_id,
    product_id: input.product_id,
    auto_confirm: input.auto_confirm ?? true,
    credit_party_identifier: input.credit_party_identifier,
  }

  const response = await fetch(`${baseUrl}/v1/transactions`, {
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
