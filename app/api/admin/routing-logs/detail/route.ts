import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { dbFindRechargeByDistributorRef } from '@/lib/lcr-v2/recharge-db'
import {
  buildRoutingAuditDetailFromLogs,
  enrichRoutingLogsWithPricing,
  listRoutingLogsForTransaction,
  mergeEvaluatedProvidersWithSkipEvents,
  mergeRoutingAttempts,
  type EvaluatedProviderAuditRow,
  type RoutingAuditAttempt,
} from '@/lib/routing/repository'
import { formatProviderCostDual, mergeRoutingLogPricing } from '@/lib/routing/log-pricing'
import { resolvePlanMappingPricing } from '@/lib/routing/plan-mapping-pricing'
import { enrichEvaluatedProvidersWithAuthoritativePricing } from '@/lib/routing/enrich-evaluated-providers-authoritative'
import { buildSystemPlanPricingConsistencyReport } from '@/lib/catalog/system-plan-pricing-consistency'
import { resolveProviderPricingForInternalPlan, resolveProviderPricingForSystemPlan } from '@/lib/catalog/resolve-provider-pricing-for-system-plan'

function catalogMappingsFromPricing(
  pricing: Awaited<ReturnType<typeof resolveProviderPricingForInternalPlan>>,
) {
  if (!pricing) return []
  return pricing.providers.map((p) => ({
    provider_id: p.providerId,
    provider_name: p.providerName,
    provider_plan_id: p.providerPlanId,
    provider_wholesale_amount: p.provider_wholesale_amount,
    provider_wholesale_currency: p.provider_wholesale_currency,
    destination_face_value: p.destination_face_value,
    destination_currency: p.destination_currency,
    system_plan_id: p.systemPlanId,
    plan_mapping_id: p.planMappingId,
  }))
}

async function loadCatalogMappings(planId: string, systemPlanId?: string | null) {
  if (systemPlanId) {
    return resolveProviderPricingForSystemPlan(systemPlanId).then(catalogMappingsFromPricing)
  }
  return resolveProviderPricingForInternalPlan(planId).then(catalogMappingsFromPricing)
}

async function loadPlanMappingPricing(input: {
  planId: string | null | undefined
  providerId: string | null | undefined
  providerPlanId: string | null | undefined
}) {
  if (!input.planId || !input.providerId) return null
  try {
    return await resolvePlanMappingPricing({
      planId: input.planId,
      providerId: input.providerId,
      providerPlanId: input.providerPlanId,
    })
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'routing_logs.view')
  if (denied) return denied

  const url = new URL(request.url)
  const transactionId = url.searchParams.get('transactionId')

  if (!transactionId) {
    return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
  }

  try {
    const routingLogs = await listRoutingLogsForTransaction(transactionId)
    const logsAudit = routingLogs.length ? buildRoutingAuditDetailFromLogs(routingLogs) : null

    const attempt = await dbFindRechargeByDistributorRef(transactionId).catch(() => null)
    if (attempt) {
      const routingDecision =
        attempt.routing_decision && typeof attempt.routing_decision === 'object'
          ? (attempt.routing_decision as Record<string, unknown>)
          : {}
      const systemPlanId =
        typeof routingDecision.system_plan_id === 'string'
          ? routingDecision.system_plan_id.trim()
          : null

      const catalogMappings = await loadCatalogMappings(attempt.internal_plan_id, systemPlanId)

      const mappedPricing = await loadPlanMappingPricing({
        planId: systemPlanId || attempt.internal_plan_id,
        providerId: attempt.selected_provider_id,
        providerPlanId: attempt.selected_provider_plan_id,
      })

      const wholesaleAmount = mappedPricing?.wholesaleAmount ?? null
      const wholesaleCurrency = mappedPricing?.wholesaleCurrency ?? null
      const dual = formatProviderCostDual(wholesaleAmount, wholesaleCurrency)

      const pricing = mergeRoutingLogPricing(
        {
          providerId: attempt.selected_provider_id,
          providerCost: wholesaleAmount,
        },
        {
          userAmount: attempt.send_amount,
          userCurrency: attempt.currency,
          routingDecision: attempt.routing_decision,
          providerCost: wholesaleAmount,
          providerCurrency: wholesaleCurrency,
        },
      )

      const attemptsRaw = Array.isArray(attempt.attempts) ? attempt.attempts : []
      const evaluatedRaw = routingDecision.evaluated_providers ?? routingDecision.evaluatedProviders
      let evaluatedList: EvaluatedProviderAuditRow[] = Array.isArray(evaluatedRaw)
        ? (evaluatedRaw as EvaluatedProviderAuditRow[]).map((ev) => ({ ...ev }))
        : []

      const skipSources: Array<{
        providerId?: string | null
        providerName?: string | null
        skipReason?: string | null
        filterReason?: string | null
        skipped?: boolean
      }> = []

      for (const hop of attemptsRaw) {
        if (!hop?.skipped) continue
        skipSources.push({
          providerId: hop.providerId ?? null,
          providerName: hop.providerName ?? hop.providerId ?? null,
          skipReason: hop.skipReason ?? hop.errorMessage ?? hop.error ?? null,
          skipped: true,
        })
      }

      if (logsAudit) {
        const logEvaluated = logsAudit.routing_decision.evaluated_providers
        if (Array.isArray(logEvaluated)) {
          for (const ev of logEvaluated as EvaluatedProviderAuditRow[]) {
            if (ev.skipped || ev.skipReason) {
              skipSources.push({
                providerId: ev.providerId ?? null,
                providerName: ev.providerName ?? ev.provider ?? null,
                skipReason: ev.skipReason ?? ev.filterReason ?? ev.reason ?? null,
                filterReason: ev.filterReason ?? null,
                skipped: Boolean(ev.skipped),
              })
            }
          }
        }
        for (const hop of logsAudit.attempts) {
          if (!hop.skipped) continue
          skipSources.push({
            providerName: hop.providerName,
            skipReason: hop.skipReason ?? hop.errorMessage ?? hop.error ?? null,
            skipped: true,
          })
        }
      }

      evaluatedList = mergeEvaluatedProvidersWithSkipEvents(evaluatedList, skipSources)

      const attemptsFromDb: RoutingAuditAttempt[] = attemptsRaw.map((hop: Record<string, unknown>) => {
        const hopDual = formatProviderCostDual(
          hop.cost != null ? Number(hop.cost) : null,
          (hop.currency as string | null) ?? wholesaleCurrency,
        )
        return {
          providerName: String(hop.providerName || hop.providerId || '—'),
          cost: hop.cost != null ? Number(hop.cost) : null,
          currency: (hop.currency as string | null) ?? pricing.providerCurrency,
          costDisplay: hopDual.providerCostDisplay,
          source: (hop.source as 'RULE' | 'LCR') ?? 'LCR',
          ok: Boolean(hop.ok),
          skipped: Boolean(hop.skipped),
          skipReason: (hop.skipReason as string | undefined) ?? (hop.errorMessage as string | undefined),
          error: hop.error as string | undefined,
          errorCode: hop.errorCode as string | undefined,
          errorMessage: hop.errorMessage as string | undefined,
          requestMethod: hop.requestMethod as string | null | undefined,
          requestUrl: hop.requestUrl as string | null | undefined,
          requestPath: (hop.requestPath as string | null | undefined) ?? (hop.requestUrl as string | null | undefined),
          requestBody: hop.requestBody as Record<string, unknown> | null | undefined,
        }
      })

      const mergedAttempts = mergeRoutingAttempts(attemptsFromDb, logsAudit?.attempts ?? []).map((hop) => {
        const hopDual = formatProviderCostDual(hop.cost ?? null, hop.currency ?? wholesaleCurrency)
        return {
          ...hop,
          costDisplay: hopDual.providerCostDisplay,
        }
      })

      const routingDecisionWithSkips = {
        ...routingDecision,
        evaluated_providers: evaluatedList,
        mapping_count:
          routingDecision.mapping_count ??
          routingDecision.candidate_provider_count ??
          evaluatedList.length,
      }

      const enrichedEvaluated = await enrichEvaluatedProvidersWithAuthoritativePricing(
        attempt.internal_plan_id,
        evaluatedList as Array<Record<string, unknown>>,
        { systemPlanId },
      )

      const consistencyReport = mappedPricing?.systemPlanId
        ? await buildSystemPlanPricingConsistencyReport(mappedPricing.systemPlanId)
        : null

      return NextResponse.json({
        attempt: {
          id: attempt.id,
          distributor_ref: attempt.distributor_ref,
          internal_plan_id: attempt.internal_plan_id,
          status: attempt.status === 'success' ? 'success' : 'failed',
          send_amount: pricing.userAmount,
          user_currency: pricing.userCurrency,
          provider_cost: pricing.providerCost ?? wholesaleAmount,
          provider_currency: pricing.providerCurrency ?? wholesaleCurrency,
          provider_cost_eur: dual.providerCostEur,
          provider_cost_inr: dual.providerCostInr,
          provider_cost_display: dual.providerCostDisplay,
          provider_destination_amount: mappedPricing?.destinationAmount ?? null,
          provider_destination_currency: mappedPricing?.destinationCurrency ?? null,
          plan_mapping: mappedPricing
            ? {
                provider_plan_id: mappedPricing.providerPlanId,
                provider_wholesale_amount: mappedPricing.wholesaleAmount,
                provider_wholesale_currency: mappedPricing.wholesaleCurrency,
                destination_face_value: mappedPricing.destinationAmount,
                destination_currency: mappedPricing.destinationCurrency,
                system_plan_id: mappedPricing.systemPlanId,
              }
            : null,
          plan_mappings_catalog: catalogMappings,
          routing_decision: {
            ...routingDecisionWithSkips,
            evaluated_providers: enrichedEvaluated.evaluated,
          },
          pricing_debug: enrichedEvaluated.pricingDebug,
          orphan_providers: enrichedEvaluated.orphanProviders,
          consistency_report: consistencyReport,
          attempts: mergedAttempts,
        },
      })
    }

    const logs = routingLogs.length ? routingLogs : await listRoutingLogsForTransaction(transactionId)
    const enrichedLogs = await enrichRoutingLogsWithPricing(logs)
    const audit = buildRoutingAuditDetailFromLogs(enrichedLogs)
    if (!audit) {
      return NextResponse.json({ error: 'Routing details not found' }, { status: 404 })
    }

    const firstLog = enrichedLogs[0]
    const planIdForCatalog = audit.internal_plan_id ?? firstLog?.productId ?? null
    const auditRouting = audit.routing_decision as { system_plan_id?: string } | undefined
    const systemPlanIdForCatalog =
      typeof auditRouting?.system_plan_id === 'string' ? auditRouting.system_plan_id.trim() : null
    const catalogMappings = planIdForCatalog
      ? await loadCatalogMappings(planIdForCatalog, systemPlanIdForCatalog)
      : []

    const mappedPricing = await loadPlanMappingPricing({
      planId: planIdForCatalog ?? undefined,
      providerId: firstLog?.providerId,
      providerPlanId: null,
    })

    const wholesaleAmount = audit.provider_cost ?? mappedPricing?.wholesaleAmount ?? null
    const wholesaleCurrency = audit.provider_currency ?? mappedPricing?.wholesaleCurrency ?? null
    const dual = formatProviderCostDual(wholesaleAmount, wholesaleCurrency)

    return NextResponse.json({
      attempt: {
        ...audit,
        provider_cost: wholesaleAmount,
        provider_currency: wholesaleCurrency,
        provider_cost_eur: dual.providerCostEur,
        provider_cost_inr: dual.providerCostInr,
        provider_cost_display: dual.providerCostDisplay,
        provider_destination_amount: mappedPricing?.destinationAmount ?? null,
        provider_destination_currency: mappedPricing?.destinationCurrency ?? null,
        plan_mapping: mappedPricing
          ? {
              provider_plan_id: mappedPricing.providerPlanId,
              provider_wholesale_amount: mappedPricing.wholesaleAmount,
              provider_wholesale_currency: mappedPricing.wholesaleCurrency,
              destination_face_value: mappedPricing.destinationAmount,
              destination_currency: mappedPricing.destinationCurrency,
              system_plan_id: mappedPricing.systemPlanId,
            }
          : null,
        plan_mappings_catalog: catalogMappings,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[routing-logs/detail]', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
