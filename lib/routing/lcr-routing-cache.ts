/**
 * Short-TTL Redis caches for LCR routing hot paths (replica-safe).
 * Does not change routing decisions — only caches config/catalog reads.
 */
import type { LcrEngineSettings, ProviderPriorityRow, RoutingRuleRow } from '@/lib/routing/types'
import type { AuthoritativeCandidateBundle } from '@/lib/recharge-orchestration/authoritative-candidate-loader'
import { getLcrEngineSettings, listRoutingRules, listProviderPriorities } from '@/lib/routing/repository'
import { loadAuthoritativeCandidateBundle } from '@/lib/recharge-orchestration/authoritative-candidate-loader'
import { cacheDelByPrefix, cacheGetJson, cacheSetJson } from '@/lib/cache/redis'

const DEFAULT_TTL_SEC = 30
const PREFIX = 'lcr:routing:v1:'

type Box<T> = { v: T }

async function getBox<T>(key: string): Promise<T | undefined> {
  const hit = await cacheGetJson<Box<T>>(key)
  if (!hit || !('v' in hit)) return undefined
  return hit.v
}

async function setBox<T>(key: string, value: T): Promise<void> {
  await cacheSetJson(key, { v: value } satisfies Box<T>, DEFAULT_TTL_SEC)
}

export async function clearLcrRoutingCaches(): Promise<void> {
  await cacheDelByPrefix(PREFIX)
}

export async function getCachedLcrEngineSettings(): Promise<LcrEngineSettings | null> {
  const key = `${PREFIX}settings`
  const hit = await getBox<LcrEngineSettings | null>(key)
  if (hit !== undefined) return hit
  const value = await getLcrEngineSettings()
  await setBox(key, value)
  return value
}

export async function getCachedRoutingRules(): Promise<RoutingRuleRow[]> {
  const key = `${PREFIX}rules`
  const hit = await getBox<RoutingRuleRow[]>(key)
  if (hit !== undefined) return hit
  const value = await listRoutingRules()
  await setBox(key, value)
  return value
}

export async function getCachedProviderPriorities(): Promise<ProviderPriorityRow[]> {
  const key = `${PREFIX}priorities`
  const hit = await getBox<ProviderPriorityRow[]>(key)
  if (hit !== undefined) return hit
  const value = await listProviderPriorities()
  await setBox(key, value)
  return value
}

export async function getCachedAuthoritativeBundle(
  internalPlanId: string,
  systemPlanId?: string | null,
): Promise<AuthoritativeCandidateBundle | null> {
  const key = `${PREFIX}bundle:${internalPlanId}:${systemPlanId ?? ''}`
  const hit = await getBox<AuthoritativeCandidateBundle | null>(key)
  if (hit !== undefined) return hit
  const value = await loadAuthoritativeCandidateBundle(internalPlanId, {
    systemPlanId: systemPlanId ?? undefined,
  })
  await setBox(key, value)
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

export async function getCachedCountryIso3(countryId: string): Promise<string | undefined> {
  const key = `${PREFIX}iso3:${countryId.trim().toUpperCase()}`
  return getBox<string>(key)
}

export async function setCachedCountryIso3(countryId: string, iso3: string): Promise<void> {
  const key = `${PREFIX}iso3:${countryId.trim().toUpperCase()}`
  await setBox(key, iso3)
}

export async function getCachedOperator(
  countryIso3: string,
  operatorKey: string,
): Promise<{ id: string; name: string } | undefined> {
  const key = `${PREFIX}op:${countryIso3}:${operatorKey.trim().toLowerCase()}`
  return getBox<{ id: string; name: string }>(key)
}

export async function setCachedOperator(
  countryIso3: string,
  operatorKey: string,
  value: { id: string; name: string },
): Promise<void> {
  const key = `${PREFIX}op:${countryIso3}:${operatorKey.trim().toLowerCase()}`
  await setBox(key, value)
}
