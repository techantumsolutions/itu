import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  getLcrEngineSettings,
  insertRoutingLog,
  isRoutingEngineSchemaReady,
  listActiveRoutingRules,
  listProviderPriorities,
  insertDetailedRoutingLog,
} from '@/lib/routing/repository'
import { dbGetInternalPlan } from '@/lib/lcr-v2/recharge-db'
import {
  authoritativePricingKey,
  resolveProviderPricingForInternalPlan,
  type AuthoritativeProviderPricingRow,
} from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import { logAuthoritativeMappingMissing } from '@/lib/catalog/system-plan-pricing-consistency'
import {
  loadAuthoritativeCandidateBundle,
  shouldUseAuthoritativeDiscovery,
  type CandidateMappingRow,
} from '@/lib/recharge-orchestration/authoritative-candidate-loader'
import { normalizeProviderCost } from '@/lib/routing/normalize-provider-cost'
import { resolveProviderPayloadStrategy } from '@/lib/routing/provider-payload-strategy'
import { LCR_BASE_CURRENCY } from '@/lib/routing/exchange-rates'
import {
  pricingFieldsFromCandidate,
  detailedRoutingLogPricingInput,
} from '@/lib/routing/provider-pricing-log-fields'
import type {
  LcrEngineSettings,
  RoutingProviderCandidate,
  RoutingResolveInput,
  RoutingResolveResult,
  RoutingRuleRow,
} from '@/lib/routing/types'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export async function normalizeCountryToIso3(countryId: string): Promise<string> {
  const code = (countryId || '').trim().toUpperCase()
  if (code.length === 2) {
    try {
      const res = await supabaseRest(
        `countries?iso2=eq.${encodeURIComponent(code)}&select=id`,
        { cache: 'no-store' }
      )
      if (res.ok) {
        const rows = await res.json() as Array<{ id: string }>
        if (rows?.[0]?.id) {
          return rows[0].id.toUpperCase()
        }
      }
    } catch {
      // fallback
    }
  }
  return code
}

export type SystemOperatorInfo = {
  id: string
  name: string
}

export async function resolveSystemOperator(
  operatorIdOrName: string,
  countryIso3: string
): Promise<SystemOperatorInfo> {
  const op = (operatorIdOrName || '').trim()
  if (!op || op.toLowerCase() === 'unknown') {
    return { id: op, name: op || 'Unknown' }
  }

  let lookupId = op
  if (op.startsWith('system:')) {
    lookupId = op.slice(7)
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookupId)

  try {
    let query = ''
    if (isUuid) {
      query = `system_operators?id=eq.${encodeURIComponent(lookupId)}&limit=1`
    } else {
      query = `system_operators?country_id=eq.${encodeURIComponent(countryIso3)}&or=(system_operator_name.ilike.${encodeURIComponent(op)},slug.eq.${encodeURIComponent(op.toLowerCase())})&limit=1`
    }

    const res = await supabaseRest(query, { cache: 'no-store' })
    if (res.ok) {
      const rows = await res.json() as Array<{ id: string; system_operator_name: string }>
      if (rows?.[0]) {
        return {
          id: `system:${rows[0].id}`,
          name: rows[0].system_operator_name,
        }
      }
    }
  } catch {
    // ignore
  }

  return { id: op, name: op }
}

export async function normalizeOperatorId(operatorId: string, countryIso3: string): Promise<string> {
  const info = await resolveSystemOperator(operatorId, countryIso3)
  return info.id
}

function weightedScore(input: { normalizedPrice: number; providerPriority: number; margin?: number }) {
  const marginBonus = (input.margin ?? 0) * -0.01
  return input.normalizedPrice + input.providerPriority * 0.002 + marginBonus
}

function routingSortPrice(candidate: RoutingProviderCandidate): number {
  if (typeof candidate.normalized_provider_price === 'number' && Number.isFinite(candidate.normalized_provider_price)) {
    return candidate.normalized_provider_price
  }
  return Infinity
}

function stripSystemOperatorRef(operatorId: string): string {
  const t = operatorId.trim().toLowerCase()
  return t.startsWith('system:') ? t.slice(7) : t
}

/** Country on rule may be a single ISO3 or comma-separated list (admin multi-select). */
export function ruleCountryMatches(ruleCountry: string | null | undefined, ctxCountry: string): boolean {
  if (!ruleCountry?.trim() || ruleCountry.trim() === '*') return true
  const country = ctxCountry.trim().toUpperCase()
  const parts = ruleCountry
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  if (parts.length === 0) return true
  return parts.includes(country)
}

/** Rules store system_operators.id; routing context uses `system:{uuid}` after normalization. */
export function ruleOperatorMatches(ruleOperator: string | null | undefined, ctxOperator: string): boolean {
  if (!ruleOperator?.trim()) return true
  const ruleOp = stripSystemOperatorRef(ruleOperator)
  const ctxOp = stripSystemOperatorRef(ctxOperator)
  if (ruleOp === ctxOp) return true
  return ruleOperator.trim().toLowerCase() === ctxOperator.trim().toLowerCase()
}

export function ruleMatches(rule: RoutingRuleRow, ctx: RoutingResolveInput): boolean {
  const country = (ctx.countryId ?? '').toUpperCase()
  const productType = (ctx.productType ?? ctx.service ?? '').toLowerCase()

  if (!ruleCountryMatches(rule.countryId, country)) return false
  if (!ruleOperatorMatches(rule.operatorId, ctx.operatorId ?? '')) return false
  if (rule.productType && rule.productType.toLowerCase() !== productType) return false
  return true
}

function listMatchingRoutingRules(rules: RoutingRuleRow[], ctx: RoutingResolveInput): RoutingRuleRow[] {
  return rules.filter((r) => ruleMatches(r, ctx)).sort((a, b) => a.priority - b.priority)
}

/** Walk matching rules by priority; return the first whose provider is mapped and eligible. */
export function resolveViableRoutingRule(
  rules: RoutingRuleRow[],
  ctx: RoutingResolveInput,
  eligible: RoutingProviderCandidate[],
): { rule: RoutingRuleRow; candidate: RoutingProviderCandidate } | null {
  for (const rule of listMatchingRoutingRules(rules, ctx)) {
    const candidate = eligible.find((e) => e.providerId === rule.providerId)
    if (candidate) return { rule, candidate }
  }
  return null
}

type MappingRow = CandidateMappingRow

async function loadLegacyCandidates(productId: string): Promise<{
  mappings: MappingRow[]
  providers: Map<string, Record<string, unknown>>
  providersToEvaluate: Record<string, unknown>[]
  authoritativeByKey: Map<string, AuthoritativeProviderPricingRow>
  systemPlanId: string | null
  discoverySource: 'legacy_internal_cache'
}> {
  const mapRes = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(productId)}&select=provider_id,provider_plan_id,provider_price,provider_currency,provider_priority,margin,enabled`,
    { cache: 'no-store' },
  )
  if (!mapRes.ok) throw new Error(await mapRes.text())
  const mappings = (await mapRes.json()) as MappingRow[]

  const authoritative = await resolveProviderPricingForInternalPlan(productId)
  const authoritativeByKey = authoritative?.byKey ?? new Map<string, AuthoritativeProviderPricingRow>()

  for (const mapping of mappings) {
    const authRow = authoritativeByKey.get(
      authoritativePricingKey(mapping.provider_id, mapping.provider_plan_id),
    )
    if (authRow) {
      mapping.provider_price = authRow.provider_wholesale_amount
      mapping.provider_currency = authRow.provider_wholesale_currency
      mapping.destination_amount = authRow.destination_face_value
      mapping.destination_currency = authRow.destination_currency
    } else {
      mapping.provider_price = null
      mapping.provider_currency = null
      mapping.destination_amount = null
      mapping.destination_currency = null
    }
  }

  const providersRes = await supabaseRest(
    `lcr_providers?select=id,code,name,is_active,priority,status,supported_countries,adapter_key,credentials_encrypted`,
    { cache: 'no-store' },
  )
  const providerRows =
    providersRes && providersRes.ok ? ((await providersRes.json()) as Record<string, unknown>[]) : []
  const providers = new Map<string, Record<string, unknown>>(providerRows.map((p) => [String(p.id), p]))

  return {
    mappings,
    providers,
    providersToEvaluate: providerRows,
    authoritativeByKey,
    systemPlanId: authoritative?.systemPlanId ?? null,
    discoverySource: 'legacy_internal_cache',
  }
}

async function loadCandidates(
  productId: string,
  systemPlanId?: string | null,
): Promise<{
  mappings: MappingRow[]
  providers: Map<string, Record<string, unknown>>
  providersToEvaluate: Record<string, unknown>[]
  authoritativeByKey: Map<string, AuthoritativeProviderPricingRow>
  systemPlanId: string | null
  discoverySource: 'plan_mappings' | 'legacy_internal_cache'
}> {
  const authoritativeBundle = await loadAuthoritativeCandidateBundle(productId, {
    systemPlanId: systemPlanId ?? undefined,
  })
  const authoritativeCount = authoritativeBundle?.mappings.length ?? 0
  const useAuthoritative = shouldUseAuthoritativeDiscovery(
    authoritativeBundle?.parity ?? null,
    authoritativeCount,
  )

  if (useAuthoritative && authoritativeBundle) {
    if (authoritativeBundle.parity && !authoritativeBundle.parity.ok) {
      console.warn(
        '[ROUTING] Using plan_mappings discovery (admin/products source); internal cache parity warnings:',
        authoritativeBundle.parity.errors,
      )
    }
    return {
      mappings: authoritativeBundle.mappings,
      providers: authoritativeBundle.providers,
      providersToEvaluate: authoritativeBundle.providersToEvaluate,
      authoritativeByKey: authoritativeBundle.authoritativeByKey,
      systemPlanId: authoritativeBundle.systemPlanId,
      discoverySource: 'plan_mappings',
    }
  }

  if (authoritativeBundle?.parity && !authoritativeBundle.parity.ok && authoritativeCount === 0) {
    console.warn(
      '[ROUTING] No plan_mappings providers — falling back to legacy internal_plan_provider_mapping:',
      authoritativeBundle.parity.errors,
    )
  } else if (authoritativeBundle?.parity && !authoritativeBundle.parity.ok && authoritativeCount > 0) {
    // Authoritative providers exist; legacy fallback skipped (logged above when used).
  } else if (!authoritativeBundle || authoritativeCount === 0) {
    console.warn(
      '[ROUTING] No authoritative plan_mappings candidates — falling back to legacy internal_plan_provider_mapping',
    )
  }

  return loadLegacyCandidates(productId)
}

function evaluateCandidates(
  mappings: MappingRow[],
  providers: Map<string, Record<string, unknown>>,
  providersToEvaluate: Record<string, unknown>[],
  ctx: RoutingResolveInput,
  priorityMap: Map<string, number>,
  authoritativeByKey: Map<string, AuthoritativeProviderPricingRow>,
  internalPlanId: string,
): RoutingProviderCandidate[] {
  const country = (ctx.countryId ?? '').toUpperCase()

  return providersToEvaluate.map((prov) => {
    const providerId = String(prov.id)
    const providerName = String(prov.name ?? prov.code ?? providerId)
    const providerCode = prov.code != null ? String(prov.code) : undefined
    const activeStatus = Boolean(prov.is_active)
    const onlineStatus = String(prov.status ?? 'unknown')
    const priority = priorityMap.get(providerId) ?? (typeof prov.priority === 'number' ? prov.priority : 100)

    const mapping = mappings.find((m) => m.provider_id === providerId)
    const mappingExists = !!mapping

    if (!mappingExists) {
      return {
        providerId,
        providerName,
        providerCode,
        activeStatus,
        onlineStatus,
        mappingExists,
        price: Infinity,
        margin: 0,
        providerPriority: priority,
        eligible: false,
        filterReason: 'PLAN_MAPPING_MISSING',
        reason: 'PLAN_MAPPING_MISSING',
      }
    }

    const providerPlanId = mapping.provider_plan_id
    const authoritative = authoritativeByKey.get(
      authoritativePricingKey(providerId, providerPlanId),
    )

    if (!authoritative) {
      logAuthoritativeMappingMissing({
        context: 'routing-engine-evaluateCandidates',
        internalPlanId,
        providerId,
        providerName,
        providerPlanId,
      })
      return {
        providerId,
        providerName,
        providerPlanId,
        providerCode,
        activeStatus,
        onlineStatus,
        mappingExists,
        price: Infinity,
        margin: typeof mapping.margin === 'number' ? mapping.margin : 0,
        providerPriority: priority,
        eligible: false,
        filterReason: 'AUTHORITATIVE_MAPPING_MISSING',
        reason: 'AUTHORITATIVE_MAPPING_MISSING',
      }
    }

    const provider_wholesale_amount =
      typeof authoritative.provider_wholesale_amount === 'number' &&
      authoritative.provider_wholesale_amount > 0
        ? authoritative.provider_wholesale_amount
        : Infinity
    const provider_wholesale_currency =
      (authoritative.provider_wholesale_currency ?? '').trim().toUpperCase() || undefined
    const destination_face_value =
      typeof authoritative.destination_face_value === 'number' &&
      authoritative.destination_face_value > 0
        ? authoritative.destination_face_value
        : undefined
    const destination_currency = authoritative.destination_currency ?? undefined
    const margin = typeof mapping.margin === 'number' ? mapping.margin : 0
    const price = provider_wholesale_amount
    const currency = provider_wholesale_currency
    const providerPayloadStrategy = resolveProviderPayloadStrategy(prov)

    if (mapping.enabled === false) {
      return {
        providerId,
        providerName,
        providerPlanId,
        providerCode,
        activeStatus,
        onlineStatus,
        mappingExists,
        price,
        margin,
        providerPriority: priority,
        eligible: false,
        filterReason: 'PROVIDER_DISABLED',
        reason: 'PROVIDER_DISABLED',
      }
    }

    if (!activeStatus) {
      return {
        providerId,
        providerName,
        providerPlanId,
        providerCode,
        activeStatus,
        onlineStatus,
        mappingExists,
        price,
        margin,
        providerPriority: priority,
        eligible: false,
        filterReason: 'PROVIDER_DISABLED',
        reason: 'PROVIDER_DISABLED',
      }
    }

    let filterReason = 'ELIGIBLE'
    let eligible = true

    if (onlineStatus === 'offline') {
      filterReason = 'PROVIDER_OFFLINE'
      eligible = false
    }

    const supported = (prov.supported_countries as string[] | undefined) ?? []
    if (eligible && supported.length && country && !supported.some((c) => c.toUpperCase() === country)) {
      filterReason = 'COUNTRY_NOT_SUPPORTED'
      eligible = false
    }

    if (eligible && (!Number.isFinite(provider_wholesale_amount) || provider_wholesale_amount <= 0)) {
      filterReason = 'PRICE_MISSING'
      eligible = false
    }

    if (eligible && !provider_wholesale_currency) {
      filterReason = 'CURRENCY_MISSING'
      eligible = false
    }

    const score = eligible
      ? weightedScore({ normalizedPrice: provider_wholesale_amount, providerPriority: priority, margin })
      : Infinity

    return {
      providerId,
      providerName,
      providerPlanId,
      providerCode,
      activeStatus,
      onlineStatus,
      mappingExists,
      price,
      margin,
      providerPriority: priority,
      eligible,
      filterReason,
      reason: filterReason,
      score,
      currency,
      provider_wholesale_amount: Number.isFinite(provider_wholesale_amount) ? provider_wholesale_amount : undefined,
      provider_wholesale_currency,
      destination_face_value,
      destination_currency,
      providerPayloadStrategy,
    }
  })
}

async function enrichCandidatesWithNormalizedCosts(
  candidates: RoutingProviderCandidate[],
): Promise<RoutingProviderCandidate[]> {
  const enriched: RoutingProviderCandidate[] = []
  for (const candidate of candidates) {
    if (!candidate.eligible) {
      enriched.push(candidate)
      continue
    }
    const wholesaleAmount = candidate.provider_wholesale_amount ?? candidate.price
    const wholesaleCurrency = candidate.provider_wholesale_currency ?? candidate.currency
    if (wholesaleAmount == null || !wholesaleCurrency) {
      enriched.push({
        ...candidate,
        eligible: false,
        filterReason: 'CURRENCY_MISSING',
        reason: 'CURRENCY_MISSING',
      })
      continue
    }
    const normalized = await normalizeProviderCost({
      provider_price: wholesaleAmount,
      provider_currency: wholesaleCurrency,
      base_currency: LCR_BASE_CURRENCY,
    })
    if (!normalized.success) {
      enriched.push({
        ...candidate,
        eligible: false,
        filterReason: 'CURRENCY_NORMALIZATION_FAILED',
        reason: 'CURRENCY_NORMALIZATION_FAILED',
      })
      continue
    }
    enriched.push({
      ...candidate,
      normalized_provider_price: normalized.normalized_provider_price,
      normalized_provider_currency: normalized.normalized_provider_currency,
      score: weightedScore({
        normalizedPrice: normalized.normalized_provider_price,
        providerPriority: candidate.providerPriority,
        margin: candidate.margin,
      }),
    })
  }
  return enriched
}

function sortByStrategy(
  eligible: RoutingProviderCandidate[],
  settings: LcrEngineSettings,
): RoutingProviderCandidate[] {
  const strategy = settings.routingStrategy ?? 'LEAST_COST'
  if (strategy === 'PRIORITY') {
    return [...eligible].sort((a, b) => {
      if (a.providerPriority !== b.providerPriority) return a.providerPriority - b.providerPriority
      return routingSortPrice(a) - routingSortPrice(b)
    })
  }
  if (strategy === 'HIGHEST_MARGIN') {
    return [...eligible].sort((a, b) => {
      const ma = a.margin ?? 0
      const mb = b.margin ?? 0
      if (ma !== mb) return mb - ma
      return routingSortPrice(a) - routingSortPrice(b)
    })
  }
  return [...eligible].sort((a, b) => routingSortPrice(a) - routingSortPrice(b))
}

function buildFallbackChain(
  eligible: RoutingProviderCandidate[],
  selected: RoutingProviderCandidate,
  settings: LcrEngineSettings,
): RoutingProviderCandidate[] {
  const rest = eligible.filter((e) => e.providerId !== selected.providerId)
  if (settings.fallbackStrategy === 'PRIORITY_PROVIDER') {
    return sortByStrategy(rest, { ...settings, routingStrategy: 'PRIORITY' })
  }
  return sortByStrategy(rest, settings)
}

export class RoutingEngineService {
  async resolveProvider(input: RoutingResolveInput): Promise<RoutingResolveResult> {
    const countryId = await normalizeCountryToIso3(input.countryId)
    const operatorId = await normalizeOperatorId(input.operatorId, countryId)
    const normalizedInput = { ...input, countryId, operatorId }

    console.log(`[ROUTING] Starting routing for internal_plan_id: ${normalizedInput.productId}`)

    const schemaReady = await isRoutingEngineSchemaReady()
    const settings = schemaReady ? await getLcrEngineSettings() : null
    const effectiveSettings: LcrEngineSettings = settings ?? {
      id: 'default',
      enabled: true,
      routingStrategy: 'LEAST_COST',
      fallbackStrategy: 'NEXT_PROVIDER',
      autoFailover: true,
      retryEnabled: true,
      retryAttempts: 2,
    }

    // 1. Verify that internal_plan_id exists in internal_plans table
    const planExists = normalizedInput.productId ? await dbGetInternalPlan(normalizedInput.productId) : null
    if (!planExists) {
      console.log(`[ROUTING] INTERNAL_PLAN_NOT_FOUND: Plan ID ${normalizedInput.productId} does not exist`)
      const logId = schemaReady
        ? await insertDetailedRoutingLog({
            transactionId: normalizedInput.transactionId ?? '',
            countryCode: normalizedInput.countryId ?? '',
            operatorCode: normalizedInput.operatorId ?? '',
            planId: normalizedInput.productId,
            routingStrategy: effectiveSettings.routingStrategy,
            routingRuleMatched: 'No',
            executionResult: 'INTERNAL_PLAN_NOT_FOUND',
            verificationMappingCount: 0,
          })
        : null

      return {
        routingType: 'LCR',
        selected: null,
        fallbacks: [],
        evaluated: [],
        ruleApplied: 'NONE',
        settings: effectiveSettings,
        logId: logId ?? undefined,
        routing_decision_reason: 'INTERNAL_PLAN_NOT_FOUND',
        internal_plan_id: normalizedInput.productId,
        mapping_count: 0,
        candidate_provider_count: 0,
        eligible_provider_count: 0,
      }
    }

    // 2. Load mappings and providers
    const { mappings, providers, providersToEvaluate, authoritativeByKey, systemPlanId, discoverySource } =
      await loadCandidates(normalizedInput.productId, normalizedInput.systemPlanId)
    const mapping_count = mappings.length
    console.log(
      `[ROUTING] internal_plan_id: ${normalizedInput.productId} | system_plan_id: ${systemPlanId ?? 'n/a'} | discovery: ${discoverySource} | mapping_count: ${mapping_count}`,
    )

    // If mapping_count = 0
    if (mapping_count === 0) {
      console.log(`[ROUTING] MISSING_PROVIDER_MAPPING: No mappings found for plan ID ${normalizedInput.productId}`)
      const logId = schemaReady
        ? await insertDetailedRoutingLog({
            transactionId: normalizedInput.transactionId ?? '',
            countryCode: normalizedInput.countryId ?? '',
            operatorCode: normalizedInput.operatorId ?? '',
            planId: normalizedInput.productId,
            routingStrategy: effectiveSettings.routingStrategy,
            routingRuleMatched: 'No',
            executionResult: 'NO_PROVIDER_MAPPING',
            verificationMappingCount: 0,
          })
        : null

      return {
        routingType: 'LCR',
        selected: null,
        fallbacks: [],
        evaluated: [],
        ruleApplied: 'NONE',
        settings: effectiveSettings,
        logId: logId ?? undefined,
        routing_decision_reason: 'NO_PROVIDER_MAPPING',
        internal_plan_id: normalizedInput.productId,
        mapping_count: 0,
        candidate_provider_count: 0,
        eligible_provider_count: 0,
      }
    }

    const priorityRows = schemaReady ? await listProviderPriorities() : []
    const priorityMap = new Map(priorityRows.map((p) => [p.providerId, p.priority]))

    // Evaluate candidates
    let evaluated = evaluateCandidates(
      mappings,
      providers,
      providersToEvaluate,
      normalizedInput,
      priorityMap,
      authoritativeByKey,
      normalizedInput.productId,
    )
    evaluated = await enrichCandidatesWithNormalizedCosts(evaluated)

    // Candidate providers count (providers that have a mapping)
    const candidate_provider_count = evaluated.filter((e) => e.mappingExists).length
    // Eligible providers count
    let eligible = evaluated.filter((e) => e.eligible)
    const eligible_provider_count = eligible.length

    console.log(`[ROUTING] candidate_provider_count: ${candidate_provider_count} | eligible_provider_count: ${eligible_provider_count}`)

    // 3. Verify mapped providers exist
    if (candidate_provider_count === 0) {
      console.log(`[ROUTING] NO_CANDIDATE_PROVIDERS: Mapped providers do not exist in lcr_providers`)
      const logId = schemaReady
        ? await insertDetailedRoutingLog({
            transactionId: normalizedInput.transactionId ?? '',
            countryCode: normalizedInput.countryId ?? '',
            operatorCode: normalizedInput.operatorId ?? '',
            planId: normalizedInput.productId,
            routingStrategy: effectiveSettings.routingStrategy,
            routingRuleMatched: 'No',
            executionResult: 'NO_CANDIDATE_PROVIDERS',
            verificationMappingCount: mapping_count,
          })
        : null

      return {
        routingType: 'LCR',
        selected: null,
        fallbacks: [],
        evaluated,
        ruleApplied: 'NONE',
        settings: effectiveSettings,
        logId: logId ?? undefined,
        routing_decision_reason: 'NO_CANDIDATE_PROVIDERS',
        internal_plan_id: normalizedInput.productId,
        mapping_count,
        candidate_provider_count: 0,
        eligible_provider_count: 0,
      }
    }

    // 4. Verify at least one passes eligibility checks
    if (eligible_provider_count === 0) {
      console.log(`[ROUTING] NO_ELIGIBLE_PROVIDER: All candidates filtered out`)
      const logId = schemaReady
        ? await insertDetailedRoutingLog({
            transactionId: normalizedInput.transactionId ?? '',
            countryCode: normalizedInput.countryId ?? '',
            operatorCode: normalizedInput.operatorId ?? '',
            planId: normalizedInput.productId,
            routingStrategy: effectiveSettings.routingStrategy,
            routingRuleMatched: 'No',
            executionResult: 'NO_ELIGIBLE_PROVIDER',
            verificationMappingCount: mapping_count,
          })
        : null

      return {
        routingType: 'LCR',
        selected: null,
        fallbacks: [],
        evaluated,
        ruleApplied: 'NONE',
        settings: effectiveSettings,
        logId: logId ?? undefined,
        routing_decision_reason: 'NO_ELIGIBLE_PROVIDER',
        internal_plan_id: normalizedInput.productId,
        mapping_count,
        candidate_provider_count,
        eligible_provider_count: 0,
      }
    }

    let applicableRulesWithoutViableProvider = 0

    if (schemaReady && effectiveSettings.enabled) {
      const rules = await listActiveRoutingRules()
      const matchingRules = listMatchingRoutingRules(rules, normalizedInput)
      applicableRulesWithoutViableProvider = matchingRules.length

      for (const rule of matchingRules) {
        const forced = eligible.find((e) => e.providerId === rule.providerId)
        if (!forced) {
          console.warn(
            `[ROUTING] Rule "${rule.ruleName}" (priority ${rule.priority}) matched but provider ${rule.providerId} is not mapped/eligible — trying next rule`,
          )
          await insertDetailedRoutingLog({
            transactionId: normalizedInput.transactionId ?? '',
            countryCode: normalizedInput.countryId ?? '',
            operatorCode: normalizedInput.operatorId ?? '',
            planId: normalizedInput.productId,
            routingStrategy: effectiveSettings.routingStrategy,
            routingRuleMatched: 'No',
            routingRuleId: rule.id,
            routingRuleProvider: rule.providerName || rule.providerCode || rule.providerId,
            selectedProvider: rule.providerId,
            executionResult: 'RULE_PROVIDER_INELIGIBLE',
            failureReason:
              'Rule provider is not mapped or eligible for this plan — skipped to try next rule or LCR',
            verificationMappingCount: mapping_count,
          }).catch(() => {})
          continue
        }

        const fallbacks = effectiveSettings.autoFailover
          ? buildFallbackChain(eligible, forced, effectiveSettings)
          : []
        const logId = await insertDetailedRoutingLog({
          transactionId: normalizedInput.transactionId ?? '',
          countryCode: normalizedInput.countryId ?? '',
          operatorCode: normalizedInput.operatorId ?? '',
          planId: normalizedInput.productId,
          routingStrategy: effectiveSettings.routingStrategy,
          routingRuleMatched: 'Yes',
          routingRuleId: rule.id,
          routingRuleProvider: forced.providerName || forced.providerId,
          selectedProvider: forced.providerId,
          providerPriority: forced.providerPriority,
          executionResult: 'RULE_MATCHED',
          verificationMappingCount: mapping_count,
          ...detailedRoutingLogPricingInput(pricingFieldsFromCandidate(forced), {
            providerPlanId: forced.providerPlanId,
          }),
        })
        return {
          routingType: 'RULE',
          ruleId: rule.id,
          ruleName: rule.ruleName,
          selected: forced,
          fallbacks,
          evaluated,
          ruleApplied: 'RULE',
          settings: effectiveSettings,
          logId: logId ?? undefined,
          routing_decision_reason: 'RULE_MATCHED',
          internal_plan_id: normalizedInput.productId,
          mapping_count,
          candidate_provider_count,
          eligible_provider_count,
        }
      }

      if (matchingRules.length > 0) {
        console.log(
          `[ROUTING] ${matchingRules.length} routing rule(s) matched context but none had a viable provider — using LCR`,
        )
      }
    }

    const sorted = sortByStrategy(eligible, effectiveSettings)
    const selected = sorted[0]!
    console.log(
      `[ROUTING] Selected ${selected.providerName || selected.providerId} | wholesale=${selected.provider_wholesale_amount ?? selected.price} ${selected.provider_wholesale_currency ?? selected.currency} | normalized=${selected.normalized_provider_price} ${selected.normalized_provider_currency ?? LCR_BASE_CURRENCY}`,
    )
    const fallbacks = effectiveSettings.autoFailover
      ? buildFallbackChain(sorted, selected, effectiveSettings)
      : sorted.slice(1)

    let decisionReason = 'LEAST_COST_SELECTED'
    if (applicableRulesWithoutViableProvider > 0) {
      decisionReason = 'NO_VIABLE_ROUTING_RULE'
    } else if (effectiveSettings.routingStrategy === 'HIGHEST_MARGIN') {
      decisionReason = 'HIGHEST_MARGIN_SELECTED'
    } else if (effectiveSettings.routingStrategy === 'PRIORITY') {
      decisionReason = 'PRIORITY_SELECTED'
    }

    const logId = schemaReady
      ? await insertDetailedRoutingLog({
          transactionId: normalizedInput.transactionId ?? '',
          countryCode: normalizedInput.countryId ?? '',
          operatorCode: normalizedInput.operatorId ?? '',
          planId: normalizedInput.productId,
          routingStrategy: effectiveSettings.routingStrategy,
          routingRuleMatched: 'No',
          selectedProvider: selected.providerId,
          providerPriority: selected.providerPriority,
          executionResult: decisionReason,
          verificationMappingCount: mapping_count,
          ...detailedRoutingLogPricingInput(pricingFieldsFromCandidate(selected), {
            providerPlanId: selected.providerPlanId,
          }),
        })
      : null

    return {
      routingType: 'LCR',
      selected,
      fallbacks,
      evaluated,
      ruleApplied: 'LCR',
      settings: effectiveSettings,
      logId: logId ?? undefined,
      routing_decision_reason: decisionReason,
      internal_plan_id: normalizedInput.productId,
      mapping_count,
      candidate_provider_count,
      eligible_provider_count,
    }
  }
}

export const routingEngineService = new RoutingEngineService()

export async function resolveProvider(input: RoutingResolveInput): Promise<RoutingResolveResult> {
  return routingEngineService.resolveProvider(input)
}

export class NoActiveProviderError extends Error {
  constructor(message = 'No active provider available for this transaction') {
    super(message)
    this.name = 'NoActiveProviderError'
  }
}
