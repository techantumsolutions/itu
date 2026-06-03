import crypto from 'crypto'

export interface ApiRequestConfig {
  baseUrl: string
  authType: 'basic' | 'bearer' | 'apiKey' | 'oauth' | 'custom' | 'none'
  authParams: {
    apiKey?: string
    apiSecret?: string
    clientId?: string
    clientSecret?: string
    token?: string
    headerName?: string
    headerValuePrefix?: string
    tokenUrl?: string
  }
  timeoutMs?: number
  retries?: number
  backoffFactorMs?: number
}

export interface EndpointConfig {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH'
  responsePath?: string
  headers?: Record<string, string>
  pagination?: 'none' | 'page_header'
}

let oauthTokenCache = new Map<string, { token: string; expiresAt: number }>()

async function getOAuth2Token(config: ApiRequestConfig): Promise<string> {
  const tokenUrl = config.authParams.tokenUrl || 'https://idp.ding.com/connect/token'
  const clientId = config.authParams.clientId || ''
  const clientSecret = config.authParams.clientSecret || ''
  
  const cacheKey = `${tokenUrl}:${clientId}`
  const cached = oauthTokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    throw new Error(`OAuth token request failed with status: ${response.status}`)
  }

  const data = await response.json()
  const expiresAt = Date.now() + (data.expires_in - 60) * 1000
  oauthTokenCache.set(cacheKey, { token: data.access_token, expiresAt })
  return data.access_token
}

function getPathValue(obj: any, path: string): any {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

export async function executeGenericRequest(
  apiConfig: ApiRequestConfig,
  endpoint: EndpointConfig,
  params?: Record<string, string | number>,
  body?: unknown
): Promise<any> {
  const retries = apiConfig.retries ?? 3
  const backoff = apiConfig.backoffFactorMs ?? 1000
  const timeoutMs = apiConfig.timeoutMs ?? 30000

  let attempt = 0
  while (true) {
    try {
      return await executeRequestOnce(apiConfig, endpoint, params, body, timeoutMs)
    } catch (err: any) {
      attempt++
      const isRetryable = err.message?.includes('429') || err.message?.includes('500') || err.name === 'AbortError' || err.message?.includes('fetch failed')
      if (attempt >= retries || !isRetryable) {
        throw err
      }
      const waitTime = backoff * Math.pow(2, attempt) + Math.random() * 200
      console.warn(`[Generic API Client] Request failed: ${err.message}. Retrying in ${Math.round(waitTime)}ms (attempt ${attempt}/${retries})...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
}

async function executeRequestOnce(
  apiConfig: ApiRequestConfig,
  endpoint: EndpointConfig,
  params?: Record<string, string | number>,
  body?: unknown,
  timeoutMs?: number
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Correlation-Id': crypto.randomUUID(),
    ...(endpoint.headers || {})
  }

  // 1. Build Authorization headers
  if (apiConfig.authType === 'basic') {
    const username = apiConfig.authParams.apiKey || ''
    const password = apiConfig.authParams.apiSecret || ''
    const token = Buffer.from(password ? `${username}:${password}` : username).toString('base64')
    headers['Authorization'] = `Basic ${token}`
  } else if (apiConfig.authType === 'bearer') {
    const prefix = apiConfig.authParams.headerValuePrefix || 'Bearer '
    const token = apiConfig.authParams.token || ''
    headers['Authorization'] = `${prefix}${token}`
  } else if (apiConfig.authType === 'apiKey') {
    const headerName = apiConfig.authParams.headerName || 'api_key'
    const apiKey = apiConfig.authParams.apiKey || ''
    headers[headerName] = apiKey
  } else if (apiConfig.authType === 'oauth') {
    const token = await getOAuth2Token(apiConfig)
    headers['Authorization'] = `Bearer ${token}`
  } else if (apiConfig.authType === 'custom' && apiConfig.authParams.headerName) {
    headers[apiConfig.authParams.headerName] = apiConfig.authParams.apiKey || ''
  }

  // 2. Build URL
  let urlPath = endpoint.path
  const queryParams = new URLSearchParams()
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (urlPath.includes(`:${key}`)) {
        urlPath = urlPath.replace(`:${key}`, encodeURIComponent(String(value)))
      } else {
        queryParams.set(key, String(value))
      }
    }
  }

  const cleanBaseUrl = apiConfig.baseUrl.replace(/\/$/, '')
  const baseLower = cleanBaseUrl.toLowerCase()
  const pathLower = urlPath.toLowerCase()

  if (baseLower.endsWith('/api/v1') && pathLower.startsWith('/api/v1')) {
    urlPath = urlPath.substring(7)
  } else if (baseLower.endsWith('/api/v2') && pathLower.startsWith('/api/v2')) {
    urlPath = urlPath.substring(7)
  }

  if (!urlPath.startsWith('/')) {
    urlPath = '/' + urlPath
  }

  const queryStr = queryParams.toString()
  const finalUrl = queryStr ? `${cleanBaseUrl}${urlPath}?${queryStr}` : `${cleanBaseUrl}${urlPath}`

  // 3. Request options with timeout
  const controller = new AbortController()
  const timeoutId = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const response = await fetch(finalUrl, {
      method: endpoint.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store'
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status} - ${text || response.statusText}`)
    }

    const data = await response.json()
    return data
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function fetchGenericCatalog(
  apiConfig: ApiRequestConfig,
  endpoint: EndpointConfig,
  queryParams?: Record<string, string | number>
): Promise<any[]> {
  const responsePath = endpoint.responsePath
  const pagination = endpoint.pagination || 'none'
  
  if (pagination === 'page_header') {
    const items: any[] = []
    let page = 1
    const perPage = 100
    while (true) {
      const res = await executeGenericRequest(apiConfig, endpoint, {
        ...(queryParams || {}),
        page,
        per_page: perPage
      })
      const pageItems = responsePath ? getPathValue(res, responsePath) : res
      if (!Array.isArray(pageItems) || pageItems.length === 0) {
        break
      }
      items.push(...pageItems)
      // Check pagination headers or break if fewer than perPage
      if (pageItems.length < perPage) {
        break
      }
      page++
    }
    return items;
  } else {
    const res = await executeGenericRequest(apiConfig, endpoint, queryParams)
    const items = responsePath ? getPathValue(res, responsePath) : res
    return Array.isArray(items) ? items : [items]
  }
}
