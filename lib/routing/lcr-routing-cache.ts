/**
 * Short-TTL read caches for LCR routing hot paths.
 * Reduces duplicate DB reads within bursts (checkout, failover hops, simulations).
 * Does not change routing decisions — only caches immutable-for-seconds config/catalog reads.
 */
import type { LcrEngineSettings, ProviderPriorityRow, RoutingRuleRow } from '@/lib/routing/types'
import type { AuthoritativeCandidateBundle } from '@/lib/recharge-orchestration/authoritative-candidate-loader'
import { getLcrEngineSettings, listRoutingRules, listProviderPriorities } from '@/lib/routing/repository'
import { loadAuthoritativeCandidateBundle } from '@/lib/recharge-orchestration/authoritative-candidate-loader'

const DEFAULT_TTL_MS = 30_000

type CacheEntry<T> = { value: T; expiresAt: number }

function readCache<T>(entry: CacheEntry<T> | undefined): T | undefined {
  if (!entry) return undefined
  if (Date.now() > entry.expiresAt) return undefined
  return entry.value
}

function writeCache<T>(value: T, ttlMs: number): CacheEntry<T> {
  return { value, expiresAt: Date.now() + ttlMs }
}

let settingsCache: CacheEntry<LcrEngineSettings | null> | undefined
let rulesCache: CacheEntry<RoutingRuleRow[]> | undefined
let prioritiesCache: CacheEntry<ProviderPriorityRow[]> | undefined
const bundleCache = new Map<string, CacheEntry<AuthoritativeCandidateBundle | null>>()

const countryIso3Cache = new Map<string, CacheEntry<string>>()
const operatorCache = new Map<string, CacheEntry<{ id: string; name: string }>>()

export function clearLcrRoutingCaches(): void {
  settingsCache = undefined
  rulesCache = undefined
  prioritiesCache = undefined
  bundleCache.clear()
  countryIso3Cache.clear()
  operatorCache.clear()
}

export async function getCachedLcrEngineSettings(): Promise<LcrEngineSettings | null> {
  const hit = readCache(settingsCache)
  if (hit !== undefined) return hit
  const value = await getLcrEngineSettings()
  settingsCache = writeCache(value, DEFAULT_TTL_MS)
  return value
}

export async function getCachedRoutingRules(): Promise<RoutingRuleRow[]> {
  const hit = readCache(rulesCache)
  if (hit !== undefined) return hit
  const value = await listRoutingRules()
  rulesCache = writeCache(value, DEFAULT_TTL_MS)
  return value
}

export async function getCachedProviderPriorities(): Promise<ProviderPriorityRow[]> {
  const hit = readCache(prioritiesCache)
  if (hit !== undefined) return hit
  const value = await listProviderPriorities()
  prioritiesCache = writeCache(value, DEFAULT_TTL_MS)
  return value
}

export async function getCachedAuthoritativeBundle(
  internalPlanId: string,
  systemPlanId?: string | null,
): Promise<AuthoritativeCandidateBundle | null> {
  const key = `${internalPlanId}:${systemPlanId ?? ''}`
  const hit = readCache(bundleCache.get(key))
  if (hit !== undefined) return hit
  const value = await loadAuthoritativeCandidateBundle(internalPlanId, {
    systemPlanId: systemPlanId ?? undefined,
  })
  bundleCache.set(key, writeCache(value, DEFAULT_TTL_MS))
  return value
}

export async function getCachedActiveRoutingRules(): Promise<RoutingRuleRow[]> {
  const rules = await getCachedRoutingRules()
  const now = Date.now()
  return rules.filter((r) => {
    if (r.status !== 'ACTIVE') return false
    if (r.effectiveFrom && new Date(r.effectiveFrom).getTime() > now) return false
    if (r.effectiveTo && new Date(r.effectiveTo).getTime() < now) return false
    return true
  })
}

export function getCachedCountryIso3(countryId: string): string | undefined {
  return readCache(countryIso3Cache.get(countryId.trim().toUpperCase()))
}

export function setCachedCountryIso3(countryId: string, iso3: string): void {
  countryIso3Cache.set(countryId.trim().toUpperCase(), writeCache(iso3, DEFAULT_TTL_MS))
}

export function getCachedOperator(countryIso3: string, operatorKey: string): { id: string; name: string } | undefined {
  return readCache(operatorCache.get(`${countryIso3}:${operatorKey.trim().toLowerCase()}`))
}

export function setCachedOperator(
  countryIso3: string,
  operatorKey: string,
  value: { id: string; name: string },
): void {
  operatorCache.set(`${countryIso3}:${operatorKey.trim().toLowerCase()}`, writeCache(value, DEFAULT_TTL_MS))
}
