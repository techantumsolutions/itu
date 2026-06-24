import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { dbFindRechargeByDistributorRef } from '@/lib/lcr-v2/recharge-db'
import {
  buildRoutingAuditDetailFromLogs,
  enrichRoutingLogsWithPricing,
  listRoutingLogsForTransaction,
} from '@/lib/routing/repository'
import { formatProviderCostDual, mergeRoutingLogPricing } from '@/lib/routing/log-pricing'
import { resolvePlanMappingPricing } from '@/lib/routing/plan-mapping-pricing'
import { enrichEvaluatedProvidersWithAuthoritativePricing } from '@/lib/routing/enrich-evaluated-providers-authoritative'
import { buildSystemPlanPricingConsistencyReport } from '@/lib/catalog/system-plan-pricing-consistency'

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
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const transactionId = url.searchParams.get('transactionId')

  if (!transactionId) {
    return NextResponse.json({ error: 'transactionId is required' }, { status: 400 })
  }

  try {
    const attempt = await dbFindRechargeByDistributorRef(transactionId).catch(() => null)
    if (attempt) {
      const mappedPricing = await loadPlanMappingPricing({
        planId: attempt.internal_plan_id,
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

      const attempts = Array.isArray(attempt.attempts) ? attempt.attempts : []
      const routingDecision =
        attempt.routing_decision && typeof attempt.routing_decision === 'object'
          ? (attempt.routing_decision as Record<string, unknown>)
          : {}

      const evaluatedRaw = routingDecision.evaluated_providers ?? routingDecision.evaluatedProviders
      const evaluatedList = Array.isArray(evaluatedRaw) ? [...evaluatedRaw] : []
      for (const hop of attempts) {
        if (!hop?.skipped) continue
        const hopId = hop.providerId ?? hop.providerName
        if (!hopId) continue
        const idx = evaluatedList.findIndex(
          (ev: any) =>
            ev?.providerId === hop.providerId ||
            ev?.providerName === hop.providerName ||
            ev?.provider === hop.providerName,
        )
        const skipReason = hop.skipReason ?? hop.errorMessage ?? hop.error ?? 'Pre-validation skipped'
        if (idx >= 0) {
          evaluatedList[idx] = {
            ...evaluatedList[idx],
            eligibility: false,
            eligible: false,
            filterReason: skipReason,
            reason: skipReason,
          }
        } else {
          evaluatedList.push({
            providerId: hop.providerId,
            providerName: hop.providerName ?? hop.providerId,
            costPrice: hop.cost ?? null,
            currency: hop.currency ?? null,
            eligibility: false,
            eligible: false,
            filterReason: skipReason,
            reason: skipReason,
          })
        }
      }

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
          routing_decision: {
            ...routingDecisionWithSkips,
            evaluated_providers: enrichedEvaluated.evaluated,
          },
          pricing_debug: enrichedEvaluated.pricingDebug,
          orphan_providers: enrichedEvaluated.orphanProviders,
          consistency_report: consistencyReport,
          attempts: attempts.map((hop: any) => {
            const hopDual = formatProviderCostDual(hop.cost ?? null, hop.currency ?? wholesaleCurrency)
            return {
              providerName: hop.providerName || hop.providerId || '—',
              cost: hop.cost ?? null,
              currency: hop.currency ?? pricing.providerCurrency,
              costDisplay: hopDual.providerCostDisplay,
              source: hop.source ?? 'LCR',
              ok: Boolean(hop.ok),
              skipped: Boolean(hop.skipped),
              skipReason: hop.skipReason ?? hop.errorMessage,
              error: hop.error,
              errorCode: hop.errorCode,
              errorMessage: hop.errorMessage,
            }
          }),
        },
      })
    }

    const logs = await listRoutingLogsForTransaction(transactionId)
    const enrichedLogs = await enrichRoutingLogsWithPricing(logs)
    const audit = buildRoutingAuditDetailFromLogs(enrichedLogs)
    if (!audit) {
      return NextResponse.json({ error: 'Routing details not found' }, { status: 404 })
    }

    const firstLog = enrichedLogs[0]
    const mappedPricing = await loadPlanMappingPricing({
      planId: audit.internal_plan_id ?? firstLog?.productId,
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
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[routing-logs/detail]', message, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
