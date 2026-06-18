import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  getLcrEngineSettings,
  insertRoutingLog,
  isRoutingEngineSchemaReady,
  listActiveRoutingRules,
  listProviderPriorities,
  getMappingCount,
  insertDetailedRoutingLog,
} from '@/lib/routing/repository'
import { dbGetInternalPlan } from '@/lib/lcr-v2/recharge-db'
import { planMappingPricingKey } from '@/lib/catalog/provider-wholesale-pricing'
import { batchResolvePlanMappingPricing } from '@/lib/routing/plan-mapping-pricing'
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

function weightedScore(input: { price: number; providerPriority: number; margin?: number }) {
  const marginBonus = (input.margin ?? 0) * -0.01
  return input.price + input.providerPriority * 0.002 + marginBonus
}

function ruleMatches(rule: RoutingRuleRow, ctx: RoutingResolveInput): boolean {
  const country = (ctx.countryId ?? '').toUpperCase()
  const operator = (ctx.operatorId ?? '').toLowerCase()
  const productType = (ctx.productType ?? ctx.service ?? '').toLowerCase()

  if (rule.countryId && rule.countryId !== '*' && rule.countryId.toUpperCase() !== country) return false
  if (rule.operatorId && rule.operatorId.toLowerCase() !== operator) return false
  if (rule.productType && rule.productType.toLowerCase() !== productType) return false
  return true
}

function pickRoutingRule(rules: RoutingRuleRow[], ctx: RoutingResolveInput): RoutingRuleRow | null {
  const matched = rules.filter((r) => ruleMatches(r, ctx)).sort((a, b) => a.priority - b.priority)
  return matched[0] ?? null
}

type MappingRow = {
  provider_id: string
  provider_plan_id: string
  provider_price: number | null
  provider_currency: string | null
  provider_priority: number | null
  margin: number | null
  enabled?: boolean
}

async function loadCandidates(productId: string): Promise<{
  mappings: MappingRow[]
  providers: Map<string, Record<string, unknown>>
  allProvidersList: Record<string, unknown>[]
}> {
  const mapRes = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(productId)}&select=provider_id,provider_plan_id,provider_price,provider_currency,provider_priority,margin,enabled`,
    { cache: 'no-store' },
  )
  if (!mapRes.ok) throw new Error(await mapRes.text())
  const mappings = (await mapRes.json()) as MappingRow[]

  if (mappings.length) {
    const wholesaleByKey = await batchResolvePlanMappingPricing(
      mappings.map((mapping) => ({
        planId: productId,
        providerId: mapping.provider_id,
        providerPlanId: mapping.provider_plan_id,
      })),
    )
    for (const mapping of mappings) {
      const resolved =
        wholesaleByKey.get(
          planMappingPricingKey(productId, mapping.provider_id, mapping.provider_plan_id),
        ) ?? wholesaleByKey.get(planMappingPricingKey(productId, mapping.provider_id, null))
      if (resolved?.wholesaleAmount != null) {
        mapping.provider_price = resolved.wholesaleAmount
        mapping.provider_currency = resolved.wholesaleCurrency
      }
    }
  }

  const providersRes = await supabaseRest(
    `lcr_providers?select=id,code,name,is_active,priority,status,supported_countries`,
    { cache: 'no-store' },
  )
  const providerRows =
    providersRes && providersRes.ok ? ((await providersRes.json()) as Record<string, unknown>[]) : []
  const providers = new Map<string, Record<string, unknown>>(providerRows.map((p) => [String(p.id), p]))
  return { mappings, providers, allProvidersList: providerRows }
}

function evaluateCandidates(
  mappings: MappingRow[],
  providers: Map<string, Record<string, unknown>>,
  allProvidersList: Record<string, unknown>[],
  ctx: RoutingResolveInput,
  priorityMap: Map<string, number>,
): RoutingProviderCandidate[] {
  const country = (ctx.countryId ?? '').toUpperCase()

  return allProvidersList.map((prov) => {
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
    const price = typeof mapping.provider_price === 'number' ? mapping.provider_price : Infinity
    const margin = typeof mapping.margin === 'number' ? mapping.margin : 0
    const currency = mapping.provider_currency ?? undefined

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

    if (eligible && (!Number.isFinite(price) || price <= 0)) {
      filterReason = 'PRICE_MISSING'
      eligible = false
    }

    const score = eligible ? weightedScore({ price, providerPriority: priority, margin }) : Infinity

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
    }
  })
}

function sortByStrategy(
  eligible: RoutingProviderCandidate[],
  settings: LcrEngineSettings,
): RoutingProviderCandidate[] {
  const strategy = settings.routingStrategy ?? 'LEAST_COST'
  if (strategy === 'PRIORITY') {
    return [...eligible].sort((a, b) => {
      if (a.providerPriority !== b.providerPriority) return a.providerPriority - b.providerPriority
      return (a.price ?? 0) - (b.price ?? 0)
    })
  }
  if (strategy === 'HIGHEST_MARGIN') {
    return [...eligible].sort((a, b) => {
      const ma = a.margin ?? 0
      const mb = b.margin ?? 0
      if (ma !== mb) return mb - ma
      return (a.price ?? 0) - (b.price ?? 0)
    })
  }
  return [...eligible].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
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
    const { mappings, providers, allProvidersList } = await loadCandidates(normalizedInput.productId)
    const mapping_count = mappings.length
    console.log(`[ROUTING] internal_plan_id: ${normalizedInput.productId} | mapping_count: ${mapping_count}`)

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
    const evaluated = evaluateCandidates(mappings, providers, allProvidersList, normalizedInput, priorityMap)

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

    if (schemaReady && effectiveSettings.enabled) {
      const rules = await listActiveRoutingRules()
      const rule = pickRoutingRule(rules, normalizedInput)
      if (rule) {
        const forced = eligible.find((e) => e.providerId === rule.providerId)
        if (forced) {
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
            providerCost: forced.price,
            providerPriority: forced.providerPriority,
            executionResult: 'RULE_MATCHED',
            verificationMappingCount: mapping_count,
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
      }
    }

    const sorted = sortByStrategy(eligible, effectiveSettings)
    const selected = sorted[0]!
    const fallbacks = effectiveSettings.autoFailover
      ? buildFallbackChain(sorted, selected, effectiveSettings)
      : sorted.slice(1)

    let decisionReason = 'LEAST_COST_SELECTED'
    if (effectiveSettings.routingStrategy === 'HIGHEST_MARGIN') {
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
          providerCost: selected.price,
          providerPriority: selected.providerPriority,
          executionResult: decisionReason,
          verificationMappingCount: mapping_count,
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
