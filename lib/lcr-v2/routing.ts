import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type LcrV2Decision = {
  internalPlanId: string
  selected: {
    providerId: string
    providerPlanId: string
    providerCode?: string
    providerName?: string
    price?: number
    currency?: string
  } | null
  fallbacks: Array<{ providerId: string; providerPlanId: string; price?: number; currency?: string }>
  evaluated: Array<{ providerId: string; eligible: boolean; reason?: string; score?: number; price?: number; currency?: string }>
  ruleApplied: string
}

type RoutingRuleRow = {
  id: string
  country_iso3: string
  operator_ref: string | null
  service: string | null
  routing_type: string
  fixed_provider_id: string | null
  priorities: unknown
  is_active: boolean
}

function weightedScore(input: { price: number; providerPriority: number; successRate?: number; avgLatencyMs?: number }) {
  const reliabilityPenalty = (100 - (input.successRate ?? 95)) * 0.02
  const latencyPenalty = (input.avgLatencyMs ?? 700) * 0.00025
  return input.price + input.providerPriority * 0.002 + reliabilityPenalty + latencyPenalty
}

function ruleScore(rule: RoutingRuleRow, ctx: { countryIso3?: string; operatorRef?: string; service?: string }): number {
  let s = 0
  const c = (ctx.countryIso3 ?? '').toUpperCase()
  const rCountry = (rule.country_iso3 ?? '*').toUpperCase()
  if (rCountry === '*') s += 1
  else if (c && rCountry === c) s += 10
  else return -1

  if (rule.operator_ref) {
    if (ctx.operatorRef && rule.operator_ref === ctx.operatorRef) s += 8
    else return -1
  } else {
    s += 2
  }

  if (rule.service) {
    if (ctx.service && rule.service.toLowerCase() === ctx.service.toLowerCase()) s += 4
    else return -1
  } else {
    s += 1
  }

  return s
}

async function loadRoutingRules(): Promise<RoutingRuleRow[]> {
  const res = await supabaseRest('lcr_routing_rules?is_active=eq.true&select=*', { cache: 'no-store' })
  if (!res.ok) return []
  return (await res.json()) as RoutingRuleRow[]
}

function pickRule(rules: RoutingRuleRow[], ctx: { countryIso3?: string; operatorRef?: string; service?: string }): RoutingRuleRow | null {
  const scored = rules
    .map((r) => ({ r, s: ruleScore(r, ctx) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
  return scored[0]?.r ?? null
}

export async function routeInternalPlan(input: {
  internalPlanId: string
  countryIso3?: string
  operatorRef?: string
  service?: string
}): Promise<LcrV2Decision> {
  const mapRes = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(input.internalPlanId)}&enabled=eq.true&select=provider_id,provider_plan_id,provider_price,provider_currency,provider_priority,margin`,
    { cache: 'no-store' }
  )
  if (!mapRes.ok) throw new Error(await mapRes.text())
  const mappings = (await mapRes.json()) as Array<{
    provider_id: string
    provider_plan_id: string
    provider_price: number | null
    provider_currency: string | null
    provider_priority: number | null
  }>

  const providerIds = mappings.map((m) => m.provider_id)
  const providersRes = providerIds.length
    ? await supabaseRest(
        `lcr_providers?id=in.(${providerIds.map(enc).join(',')})&select=id,code,name,is_active,priority,status`,
        { cache: 'no-store' }
      )
    : null
  const providers = providersRes && providersRes.ok ? ((await providersRes.json()) as any[]) : []
  const providerById = new Map<string, any>(providers.map((p) => [p.id, p]))

  let evals = mappings.map((m) => {
    const prov = providerById.get(m.provider_id)
    if (!prov || !prov.is_active || prov.status === 'offline') {
      return { providerId: m.provider_id, eligible: false, reason: 'PROVIDER_INACTIVE' as const }
    }
    const price = typeof m.provider_price === 'number' ? m.provider_price : Infinity
    if (!Number.isFinite(price) || price <= 0) {
      return { providerId: m.provider_id, eligible: false, reason: 'NO_PRICE' as const }
    }
    const providerPriority =
      typeof m.provider_priority === 'number' ? m.provider_priority : typeof prov.priority === 'number' ? prov.priority : 100
    const score = weightedScore({ price, providerPriority })
    return { providerId: m.provider_id, eligible: true, score, price, currency: m.provider_currency ?? undefined }
  })

  const rules = await loadRoutingRules()
  const rule = pickRule(rules, {
    countryIso3: input.countryIso3,
    operatorRef: input.operatorRef,
    service: input.service,
  })

  let ruleApplied = 'LCR'

  if (rule?.routing_type === 'FIXED' && rule.fixed_provider_id) {
    ruleApplied = 'FIXED'
    evals = evals.map((e: any) => {
      if (!e.eligible) return e
      if (e.providerId !== rule.fixed_provider_id) return { ...e, eligible: false, reason: 'RULE_FIXED_EXCLUDED' }
      return e
    })
  } else if (rule?.routing_type === 'PRIORITY' && Array.isArray(rule.priorities)) {
    ruleApplied = 'PRIORITY'
    const order = new Map<string, number>()
    ;(rule.priorities as Array<{ providerId?: string; priority?: number }>).forEach((p, idx) => {
      if (p.providerId) order.set(p.providerId, typeof p.priority === 'number' ? p.priority : idx)
    })
    evals = evals.map((e: any) => {
      if (!e.eligible) return e
      const pri = order.get(e.providerId)
      if (pri === undefined) return { ...e, eligible: false, reason: 'RULE_PRIORITY_EXCLUDED' }
      return { ...e, rulePriority: pri }
    })
  }

  let eligible = evals.filter((e: any) => e.eligible)

  if (rule?.routing_type === 'PRIORITY' && eligible.length) {
    eligible = eligible.sort((a: any, b: any) => {
      const pa = a.rulePriority ?? 999
      const pb = b.rulePriority ?? 999
      if (pa !== pb) return pa - pb
      return (a.score ?? 0) - (b.score ?? 0)
    })
  } else {
    eligible = eligible.sort((a: any, b: any) => (a.score ?? 0) - (b.score ?? 0))
  }

  const selectedEval = eligible[0] ?? null
  const selectedMap = selectedEval ? mappings.find((m) => m.provider_id === selectedEval.providerId) : null

  return {
    internalPlanId: input.internalPlanId,
    selected:
      selectedEval && selectedMap
        ? {
            providerId: selectedEval.providerId,
            providerPlanId: selectedMap.provider_plan_id,
            providerCode: providerById.get(selectedEval.providerId)?.code,
            providerName: providerById.get(selectedEval.providerId)?.name,
            price: selectedEval.price,
            currency: selectedEval.currency,
          }
        : null,
    fallbacks: eligible.slice(1).map((e: any) => {
      const m = mappings.find((x) => x.provider_id === e.providerId)!
      return { providerId: e.providerId, providerPlanId: m.provider_plan_id, price: e.price, currency: e.currency }
    }),
    evaluated: evals as any,
    ruleApplied,
  }
}
