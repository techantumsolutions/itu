/**
 * DingConnect API Client
 * 
 * This module provides integration with the DingConnect mobile top-up API.
 * API Documentation: https://www.dingconnect.com/Api/Index
 * 
 * Authentication: OAuth2 Bearer token or API Key header
 * Base URL: https://api.dingconnect.com
 */

import type { 
  DingCountry, 
  DingProvider, 
  DingProduct, 
  DingPromotion 
} from '@/lib/types'

// API Configuration
const DING_API_BASE_URL = process.env.DING_API_BASE_URL || 'https://api.dingconnect.com'
const DING_API_KEY = process.env.DING_API_KEY || ''
const DING_CLIENT_ID = process.env.DING_CLIENT_ID || ''
const DING_CLIENT_SECRET = process.env.DING_CLIENT_SECRET || ''

// Response types
interface DingApiResponse<T> {
  ResultCode: number
  ErrorCodes?: { Code: string; Context: string }[]
  Items?: T[]
}

interface DingBalanceResponse {
  Balance: number
  CurrencyIso: string
  ResultCode: number
  ErrorCodes?: { Code: string; Context: string }[]
}

interface DingAccountLookupResponse {
  CountryIso: string
  AccountNumberNormalized: string
  Items: { ProviderCode: string; RegionCode: string }[]
  ResultCode: number
  ErrorCodes?: { Code: string; Context: string }[]
}

interface DingSendTransferRequest {
  SkuCode: string
  SendValue: number
  SendCurrencyIso?: string
  AccountNumber: string
  DistributorRef: string
  ValidateOnly?: boolean
  BillRef?: string
  Settings?: Record<string, string>
}

interface DingTransferResponse {
  TransferRecord: {
    TransferId: { TransferRef: string; DistributorRef: string }
    ProcessingState: 'Submitted' | 'Processing' | 'Complete' | 'Failed' | 'Cancelled'
    ReceiptText: string
    Price: {
      CustomerFee: number
      DistributorFee: number
      ReceiveValue: number
      ReceiveCurrencyIso: string
      SendValue: number
      SendCurrencyIso: string
    }
    AccountNumber: string
    StartedUtc: string
    CompletedUtc?: string
    ErrorCodes?: { Code: string; Context: string }[]
  }
  ResultCode: number
  ErrorCodes?: { Code: string; Context: string }[]
}

// Token cache for OAuth
let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * Get OAuth2 Bearer token
 */
async function getAccessToken(): Promise<string> {
  // Check cache
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token
  }

  // Request new token
  const response = await fetch('https://idp.ding.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: DING_CLIENT_ID,
      client_secret: DING_CLIENT_SECRET,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`)
  }

  const data = await response.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Buffer 60 seconds
  }

  return cachedToken.token
}

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Correlation-Id': crypto.randomUUID(),
  }

  // Use API key or Bearer token
  if (DING_API_KEY) {
    headers['api_key'] = DING_API_KEY
  } else if (DING_CLIENT_ID && DING_CLIENT_SECRET) {
    const token = await getAccessToken()
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${DING_API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API request failed: ${response.status} - ${errorText}`)
  }

  return response.json()
}

// ============================================================================
// API Methods
// ============================================================================

/**
 * Get list of supported countries
 */
export async function getCountries(): Promise<DingCountry[]> {
  const response = await apiRequest<DingApiResponse<DingCountry>>(
    '/api/V1/GetCountries'
  )
  return response.Items || []
}

/**
 * Get list of providers (carriers) for a country
 */
export async function getProviders(countryIso?: string): Promise<DingProvider[]> {
  const params = new URLSearchParams()
  if (countryIso) params.append('countryIsos', countryIso)
  
  const endpoint = `/api/V1/GetProviders${params.toString() ? `?${params}` : ''}`
  const response = await apiRequest<DingApiResponse<DingProvider>>(endpoint)
  return response.Items || []
}

/**
 * Get products (SKUs) for a provider
 */
export async function getProducts(
  countryIso?: string,
  providerCode?: string
): Promise<DingProduct[]> {
  const params = new URLSearchParams()
  if (countryIso) params.append('countryIsos', countryIso)
  if (providerCode) params.append('providerCodes', providerCode)
  
  const endpoint = `/api/V1/GetProducts${params.toString() ? `?${params}` : ''}`
  const response = await apiRequest<DingApiResponse<DingProduct>>(endpoint)
  return response.Items || []
}

/**
 * Get active promotions
 */
export async function getPromotions(
  countryIso?: string,
  providerCode?: string
): Promise<DingPromotion[]> {
  const params = new URLSearchParams()
  if (countryIso) params.append('countryIsos', countryIso)
  if (providerCode) params.append('providerCodes', providerCode)
  
  const endpoint = `/api/V1/GetPromotions${params.toString() ? `?${params}` : ''}`
  const response = await apiRequest<DingApiResponse<DingPromotion>>(endpoint)
  return response.Items || []
}

/**
 * Get account lookup (carrier detection from phone number)
 */
export async function getAccountLookup(
  accountNumber: string
): Promise<DingAccountLookupResponse> {
  const params = new URLSearchParams({ accountNumber })
  return apiRequest<DingAccountLookupResponse>(
    `/api/V1/GetAccountLookup?${params}`
  )
}

/**
 * Get current agent balance
 */
export async function getBalance(): Promise<DingBalanceResponse> {
  return apiRequest<DingBalanceResponse>('/api/V1/GetBalance')
}

/**
 * Estimate price for a transfer
 */
export async function estimatePrice(
  skuCode: string,
  sendValue?: number,
  receiveValue?: number
): Promise<{
  SendValue: number
  SendCurrencyIso: string
  ReceiveValue: number
  ReceiveCurrencyIso: string
}> {
  const response = await apiRequest<{
    Items: Array<{
      Price: {
        SendValue: number
        SendCurrencyIso: string
        ReceiveValue: number
        ReceiveCurrencyIso: string
      }
    }>
    ResultCode: number
  }>('/api/V1/EstimatePrices', {
    method: 'POST',
    body: JSON.stringify([
      {
        SkuCode: skuCode,
        SendValue: sendValue || 0,
        ReceiveValue: receiveValue || 0,
        BatchItemRef: '1',
      },
    ]),
  })

  if (response.Items && response.Items.length > 0) {
    return response.Items[0].Price
  }
  throw new Error('No price estimate available')
}

/**
 * Send a transfer (top-up)
 */
export async function sendTransfer(
  request: DingSendTransferRequest
): Promise<DingTransferResponse> {
  return apiRequest<DingTransferResponse>('/api/V1/SendTransfer', {
    method: 'POST',
    body: JSON.stringify(request),
  })
}

/**
 * Get provider status
 */
export async function getProviderStatus(
  providerCodes: string[]
): Promise<Array<{ ProviderCode: string; ProviderStatus: string }>> {
  const params = new URLSearchParams()
  providerCodes.forEach(code => params.append('providerCodes', code))
  
  const response = await apiRequest<{
    Items: Array<{ ProviderCode: string; ProviderStatus: string }>
    ResultCode: number
  }>(`/api/V1/GetProviderStatus?${params}`)
  
  return response.Items || []
}

/**
 * Check if API is configured
 */
export function isApiConfigured(): boolean {
  return !!(DING_API_KEY || (DING_CLIENT_ID && DING_CLIENT_SECRET))
}

/**
 * Get countries when Ding is configured.
 */
export async function getCountriesWithFallback(): Promise<DingCountry[]> {
  if (!isApiConfigured()) {
    throw new Error('Ding API is not configured')
  }
  return getCountries()
}

/**
 * Get providers when Ding is configured.
 */
export async function getProvidersWithFallback(
  countryIso: string
): Promise<DingProvider[]> {
  if (!isApiConfigured()) {
    throw new Error('Ding API is not configured')
  }
  return getProviders(countryIso)
}

/**
 * Get products when Ding is configured.
 */
export async function getProductsWithFallback(
  countryIso: string,
  providerCode?: string
): Promise<DingProduct[]> {
  if (!isApiConfigured()) {
    throw new Error('Ding API is not configured')
  }
  return getProducts(countryIso, providerCode)
}
