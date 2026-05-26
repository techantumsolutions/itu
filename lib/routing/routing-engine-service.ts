import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  getLcrEngineSettings,
  insertRoutingLog,
  isRoutingEngineSchemaReady,
  listActiveRoutingRules,
  listProviderPriorities,
} from '@/lib/routing/repository'
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

function weightedScore(input: { price: number; providerPriority: number; margin?: number }) {
  const marginBonus = (input.margin ?? 0) * -0.01
  return input.price + input.providerPriority * 0.002 + marginBonus
}

function ruleMatches(rule: RoutingRuleRow, ctx: RoutingResolveInput): boolean {
  const country = (ctx.countryId ?? '').toUpperCase()
  const operator = (ctx.operatorId ?? '').toLowerCase()
  const productType = (ctx.productType ?? ctx.service ?? '').toLowerCase()

  if (rule.countryId && rule.countryId.toUpperCase() !== country) return false
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
}

async function loadCandidates(productId: string): Promise<{
  mappings: MappingRow[]
  providers: Map<string, Record<string, unknown>>
}> {
  const mapRes = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(productId)}&enabled=eq.true&select=provider_id,provider_plan_id,provider_price,provider_currency,provider_priority,margin`,
    { cache: 'no-store' },
  )
  if (!mapRes.ok) throw new Error(await mapRes.text())
  const mappings = (await mapRes.json()) as MappingRow[]

  const providerIds = mappings.map((m) => m.provider_id)
  const providersRes = providerIds.length
    ? await supabaseRest(
        `lcr_providers?id=in.(${providerIds.map(enc).join(',')})&select=id,code,name,is_active,priority,status,supported_countries`,
        { cache: 'no-store' },
      )
    : null
  const providerRows =
    providersRes && providersRes.ok ? ((await providersRes.json()) as Record<string, unknown>[]) : []
  const providers = new Map<string, Record<string, unknown>>(providerRows.map((p) => [String(p.id), p]))
  return { mappings, providers }
}

function evaluateCandidates(
  mappings: MappingRow[],
  providers: Map<string, Record<string, unknown>>,
  ctx: RoutingResolveInput,
  priorityMap: Map<string, number>,
): RoutingProviderCandidate[] {
  const country = (ctx.countryId ?? '').toUpperCase()
  return mappings.map((m) => {
    const prov = providers.get(m.provider_id)
    if (!prov || !prov.is_active || prov.status === 'offline') {
      return {
        providerId: m.provider_id,
        providerPlanId: m.provider_plan_id,
        price: Infinity,
        providerPriority: 100,
        eligible: false,
        reason: 'PROVIDER_INACTIVE',
      }
    }

    const supported = (prov.supported_countries as string[] | undefined) ?? []
    if (supported.length && country && !supported.some((c) => c.toUpperCase() === country)) {
      return {
        providerId: m.provider_id,
        providerPlanId: m.provider_plan_id,
        price: Infinity,
        providerPriority: 100,
        eligible: false,
        reason: 'COUNTRY_NOT_SUPPORTED',
      }
    }

    const price = typeof m.provider_price === 'number' ? m.provider_price : Infinity
    if (!Number.isFinite(price) || price <= 0) {
      return {
        providerId: m.provider_id,
        providerPlanId: m.provider_plan_id,
        price: Infinity,
        providerPriority: 100,
        eligible: false,
        reason: 'NO_PRICE',
      }
    }

    const providerPriority =
      priorityMap.get(m.provider_id) ??
      (typeof m.provider_priority === 'number'
        ? m.provider_priority
        : typeof prov.priority === 'number'
          ? Number(prov.priority)
          : 100)

    const margin = typeof m.margin === 'number' ? m.margin : 0
    const score = weightedScore({ price, providerPriority, margin })

    return {
      providerId: m.provider_id,
      providerPlanId: m.provider_plan_id,
      providerCode: prov.code != null ? String(prov.code) : undefined,
      providerName: prov.name != null ? String(prov.name) : undefined,
      price,
      currency: m.provider_currency ?? undefined,
      margin,
      providerPriority,
      score,
      eligible: true,
    }
  })
}

function sortByStrategy(
  eligible: RoutingProviderCandidate[],
  settings: LcrEngineSettings,
): RoutingProviderCandidate[] {
  if (settings.routingStrategy === 'PRIORITY') {
    return [...eligible].sort((a, b) => {
      if (a.providerPriority !== b.providerPriority) return a.providerPriority - b.providerPriority
      return (a.price ?? 0) - (b.price ?? 0)
    })
  }
  if (settings.routingStrategy === 'HIGHEST_MARGIN') {
    return [...eligible].sort((a, b) => {
      const ma = a.margin ?? 0
      const mb = b.margin ?? 0
      if (ma !== mb) return mb - ma
      return (a.price ?? 0) - (b.price ?? 0)
    })
  }
  return [...eligible].sort((a, b) => (a.score ?? a.price) - (b.score ?? b.price))
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

    const { mappings, providers } = await loadCandidates(input.productId)
    const priorityRows = schemaReady ? await listProviderPriorities() : []
    const priorityMap = new Map(priorityRows.map((p) => [p.providerId, p.priority]))

    const evaluated = evaluateCandidates(mappings, providers, input, priorityMap)
    let eligible = evaluated.filter((e) => e.eligible)

    if (!eligible.length) {
      const logId = schemaReady
        ? await insertRoutingLog({
            transactionId: input.transactionId,
            countryId: input.countryId,
            operatorId: input.operatorId,
            productId: input.productId,
            routingType: 'LCR',
            status: 'NO_PROVIDER',
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
      }
    }

    if (schemaReady && effectiveSettings.enabled) {
      const rules = await listActiveRoutingRules()
      const rule = pickRoutingRule(rules, input)
      if (rule) {
        const forced = eligible.find((e) => e.providerId === rule.providerId)
        if (forced) {
          const fallbacks = effectiveSettings.autoFailover
            ? buildFallbackChain(eligible, forced, effectiveSettings)
            : []
          const logId = await insertRoutingLog({
            transactionId: input.transactionId,
            countryId: input.countryId,
            operatorId: input.operatorId,
            productId: input.productId,
            providerId: forced.providerId,
            routingType: 'RULE',
            providerCost: forced.price,
            status: 'SELECTED',
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
          }
        }
      }
    }

    const sorted = sortByStrategy(eligible, effectiveSettings)
    const selected = sorted[0]!
    const fallbacks = effectiveSettings.autoFailover
      ? buildFallbackChain(sorted, selected, effectiveSettings)
      : sorted.slice(1)

    const logId = schemaReady
      ? await insertRoutingLog({
          transactionId: input.transactionId,
          countryId: input.countryId,
          operatorId: input.operatorId,
          productId: input.productId,
          providerId: selected.providerId,
          routingType: 'LCR',
          providerCost: selected.price,
          status: 'SELECTED',
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
