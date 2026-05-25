/**
 * Legacy LCR facade.
 *
 * Runtime mock provider/pricing/routing data was removed. New flows should use
 * `lib/lcr-v2/*` and the Supabase tables from `supabase/uti_lcr_schema.sql`.
 * These legacy exports remain to keep older admin/API code compiling while
 * returning empty or configuration-required states instead of demo data.
 */

export interface Provider {
  id: string
  name: string
  code: string
  apiBaseUrl: string
  isActive: boolean
  priority: number
  supportedCountries: string[]
  credentials: {
    apiKey?: string
    clientId?: string
    clientSecret?: string
  }
  timeout: number
  maxRetries: number
  status: 'online' | 'offline' | 'degraded'
  lastHealthCheck?: string
  successRate?: number
  avgLatencyMs?: number
  feeFixedUsd?: number
  feePercent?: number
  supportedOperators?: Record<string, string[]>
  blacklistedUntil?: string
  failureStreak?: number
}

export interface ProviderPricing {
  providerId: string
  countryCode: string
  operatorCode: string
  skuCode: string
  costPrice: number
  currency: string
  margin: number
  lastUpdated: string
  rawCostPrice?: number
  fxRateUsed?: number
  feeAmountUsd?: number
  sourceLatencyMs?: number
}

export interface RoutingRule {
  id: string
  countryCode: string
  operatorCode?: string
  routingType: 'LCR' | 'PRIORITY' | 'FIXED'
  defaultProviderId?: string
  providerPriorities?: { providerId: string; priority: number }[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface LCRResult {
  providerId: string
  providerCode: string
  providerName: string
  costPrice: number
  margin: number
  estimatedProcessingTime: string
  fallbackProviders: string[]
}

export interface ProviderEvaluation {
  providerId: string
  providerCode: string
  providerName: string
  eligible: boolean
  reason?: string
  timeoutMs?: number
  latencyMs?: number
  normalizedCostUsd?: number
  weightedScore?: number
  successRate?: number
}

export interface LCRDecision {
  selected: LCRResult | null
  evaluated: ProviderEvaluation[]
  fallbackOrder: string[]
  ruleApplied: RoutingRule['routingType'] | 'NONE'
}

export type RefreshRunStatus = 'success' | 'failed' | 'partial'

export interface RefreshProviderResult {
  providerId: string
  providerName: string
  success: boolean
  message: string
}

export interface RefreshRun {
  startedAt: string
  endedAt: string
  status: RefreshRunStatus
  attempts: number
  maxAttempts: number
  source: 'manual' | 'scheduled'
  details: RefreshProviderResult[]
}

export interface CoverageRow {
  countryCode: string
  operatorCode: string
  providerCodes: string[]
}

const noMockDecision: LCRDecision = {
  selected: null,
  evaluated: [],
  fallbackOrder: [],
  ruleApplied: 'NONE',
}

export function getProvidersForCountry(_countryCode: string): Provider[] {
  return []
}

export function getRoutingRule(_countryCode: string, _operatorCode?: string): RoutingRule | null {
  return null
}

export function getProviderPricing(
  _providerId: string,
  _countryCode: string,
  _operatorCode: string,
  _skuCode: string,
): ProviderPricing | null {
  return null
}

export function selectBestProvider(
  _countryCode: string,
  _operatorCode: string,
  _skuCode: string,
  _options?: { weighted?: boolean },
): LCRResult | null {
  return null
}

export async function selectBestProviderWithObservability(
  _countryCode: string,
  _operatorCode: string,
  _skuCode: string,
  _options?: { timeoutMs?: number; weighted?: boolean },
): Promise<LCRDecision> {
  return noMockDecision
}

export async function executeRechargeWithFailover(): Promise<{
  success: false
  errorCode: string
}> {
  return {
    success: false,
    errorCode: 'LCR_V1_DISABLED_NO_MOCK_DATA',
  }
}

export function getAllProviders(): Provider[] {
  return []
}

export function getAllRoutingRules(): RoutingRule[] {
  return []
}

export function upsertRoutingRule(rule: Partial<RoutingRule> & { countryCode: string; routingType: RoutingRule['routingType'] }): RoutingRule {
  throw new Error(`Legacy LCR routing rule mutation is disabled; use database-backed LCR v2 APIs for ${rule.countryCode}`)
}

export function deleteRoutingRule(_ruleId: string): void {
  throw new Error('Legacy LCR routing rule deletion is disabled; use database-backed LCR v2 APIs')
}

export function setRoutingRuleActive(_ruleId: string, _isActive: boolean): void {
  throw new Error('Legacy LCR routing rule mutation is disabled; use database-backed LCR v2 APIs')
}

export function getAllPricing(): ProviderPricing[] {
  return []
}

export function getProviderStats(): {
  totalProviders: number
  activeProviders: number
  onlineProviders: number
  averageSuccessRate: number
  averageLatencyMs: number
  totalCountries: number
  totalPricingRows: number
} {
  return {
    totalProviders: 0,
    activeProviders: 0,
    onlineProviders: 0,
    averageSuccessRate: 0,
    averageLatencyMs: 0,
    totalCountries: 0,
    totalPricingRows: 0,
  }
}

export function setProviderActive(_providerId: string, _isActive: boolean): void {
  throw new Error('Legacy LCR provider mutation is disabled; use database-backed LCR provider APIs')
}

export function getCoverageRows(): CoverageRow[] {
  return []
}

export async function refreshAggregatorData(options?: {
  source?: 'manual' | 'scheduled'
  maxAttempts?: number
}): Promise<RefreshRun> {
  const now = new Date().toISOString()
  return {
    startedAt: now,
    endedAt: now,
    status: 'failed',
    attempts: 0,
    maxAttempts: options?.maxAttempts ?? 0,
    source: options?.source ?? 'manual',
    details: [],
  }
}

export function getLatestRefreshRun(): RefreshRun | null {
  return null
}

export function getRefreshHistory(): RefreshRun[] {
  return []
}

export function isInRefreshWindow(_now = new Date()): boolean {
  return false
}
