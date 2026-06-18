import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { dbFindRechargeByDistributorRef } from '@/lib/lcr-v2/recharge-db'
import {
  buildRoutingAuditDetailFromLogs,
  enrichRoutingLogsWithPricing,
  listRoutingLogsForTransaction,
} from '@/lib/routing/repository'
import { mergeRoutingLogPricing } from '@/lib/routing/log-pricing'
import { resolvePlanMappingPricing } from '@/lib/routing/plan-mapping-pricing'

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
      const mappedPricing =
        attempt.selected_provider_id
          ? await resolvePlanMappingPricing({
              planId: attempt.internal_plan_id,
              providerId: attempt.selected_provider_id,
              providerPlanId: attempt.selected_provider_plan_id,
            }).catch(() => null)
          : null

      const pricing = mergeRoutingLogPricing(
        {
          providerId: attempt.selected_provider_id,
          providerCost: mappedPricing?.wholesaleAmount ?? null,
        },
        {
          userAmount: attempt.send_amount,
          userCurrency: attempt.currency,
          routingDecision: attempt.routing_decision,
          providerCost: mappedPricing?.wholesaleAmount ?? null,
          providerCurrency: mappedPricing?.wholesaleCurrency ?? null,
        },
      )

      const attempts = Array.isArray(attempt.attempts) ? attempt.attempts : []
      const routingDecision =
        attempt.routing_decision && typeof attempt.routing_decision === 'object'
          ? (attempt.routing_decision as Record<string, unknown>)
          : {}

      return NextResponse.json({
        attempt: {
          id: attempt.id,
          distributor_ref: attempt.distributor_ref,
          internal_plan_id: attempt.internal_plan_id,
          status: attempt.status === 'success' ? 'success' : 'failed',
          send_amount: pricing.userAmount,
          user_currency: pricing.userCurrency,
          provider_cost: pricing.providerCost,
          provider_currency: pricing.providerCurrency,
          provider_destination_amount: mappedPricing?.destinationAmount ?? null,
          provider_destination_currency: mappedPricing?.destinationCurrency ?? null,
          routing_decision: routingDecision,
          attempts: attempts.map((hop: any) => ({
            providerName: hop.providerName || hop.providerId || '—',
            cost: hop.cost ?? null,
            currency: hop.currency ?? pricing.providerCurrency,
            source: hop.source ?? 'LCR',
            ok: Boolean(hop.ok),
            error: hop.error,
            errorCode: hop.errorCode,
            errorMessage: hop.errorMessage,
          })),
        },
      })
    }

    const logs = await listRoutingLogsForTransaction(transactionId)
    const enrichedLogs = await enrichRoutingLogsWithPricing(logs)
    const audit = buildRoutingAuditDetailFromLogs(enrichedLogs)
    if (!audit) {
      return NextResponse.json({ error: 'Routing details not found' }, { status: 404 })
    }

    return NextResponse.json({ attempt: audit })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
