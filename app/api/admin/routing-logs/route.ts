import { NextResponse } from 'next/server'
import { adminCanUseFeature, requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { listRoutingLogs, enrichRoutingLogsWithPricing, enrichRoutingLogsWithOperatorNames, enrichRoutingLogsWithPlanNames } from '@/lib/routing/repository'
import { parseRoutingLogStatus } from '@/lib/routing/log-pricing'

function wholesaleFromGroupedLog(log: {
  providerCost: number | null
  providerCurrency?: string | null
  status: string
}) {
  const meta = parseRoutingLogStatus(log.status)
  const amount =
    typeof meta.provider_wholesale_amount === 'number' && Number.isFinite(meta.provider_wholesale_amount)
      ? meta.provider_wholesale_amount
      : log.providerCost
  const currency =
    typeof meta.provider_wholesale_currency === 'string' && meta.provider_wholesale_currency
      ? String(meta.provider_wholesale_currency).toUpperCase()
      : log.providerCurrency ?? null
  return { amount: amount ?? null, currency }
}

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'routing_logs.view')
  if (denied) return denied

  const url = new URL(request.url)
  const countryId = url.searchParams.get('countryId') ?? undefined
  const operatorId = url.searchParams.get('operatorId') ?? undefined
  const providerId = url.searchParams.get('providerId') ?? undefined
  const from = url.searchParams.get('from') ?? undefined
  const to = url.searchParams.get('to') ?? undefined
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50)))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0))

  // Fetch a larger batch from database to allow in-memory grouping
  const { logs, total: rawTotal } = await listRoutingLogs({
    countryId,
    operatorId,
    providerId,
    from,
    to,
    limit: 1000,
    offset: 0,
  })

  // Group by transactionId
  const groups: Record<string, typeof logs> = {}
  const ungrouped: typeof logs = []

  for (const log of logs) {
    if (!log.transactionId) {
      ungrouped.push(log)
    } else {
      if (!groups[log.transactionId]) {
        groups[log.transactionId] = []
      }
      groups[log.transactionId].push(log)
    }
  }

  const groupedLogs: any[] = []

  // Helper to parse status JSON
  const parseStatus = (statusStr: string) => {
    try {
      if (statusStr && statusStr.startsWith('{')) {
        return JSON.parse(statusStr)
      }
    } catch (e) {}
    return null
  }

  // Process grouped logs
  for (const [txId, txLogs] of Object.entries(groups)) {
    // Sort txLogs by createdAt asc to process in chronological order
    const sortedTxLogs = [...txLogs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    
    // Find the final event or the latest event
    let finalLog = sortedTxLogs[sortedTxLogs.length - 1]
    let maxAttempt = 0
    let strategy = 'LEAST_COST'
    let ruleMatched = 'No'
    let ruleId: string | null = null
    let ruleProvider: string | null = null
    let resolvedProviderName: string | undefined = finalLog.providerName
    let resolvedProviderCode: string | undefined = finalLog.providerCode
    let resolvedProviderId: string | null = finalLog.providerId ?? null
    let resolvedCost: number | null = null
    let resolvedProviderCurrency: string | null = null
    let resolvedUserAmount: number | null = null
    let resolvedUserCurrency: string | null = null
    let resolvedStatus = finalLog.status
    let outcomeStatus = 'processing'

    for (const log of sortedTxLogs) {
      const parsed = parseStatus(log.status)
      if (parsed) {
        if (parsed.routingStrategy) strategy = parsed.routingStrategy
        if (parsed.routingRuleMatched === 'Yes') {
          ruleMatched = 'Yes'
        } else if (parsed.routingRuleMatched === 'No' && ruleMatched !== 'Yes') {
          ruleMatched = 'No'
        }
        if (parsed.routingRuleId) ruleId = parsed.routingRuleId
        if (parsed.routingRuleProvider) ruleProvider = parsed.routingRuleProvider
        const event = parsed.event
        if (
          event === 'RULE_MATCHED' ||
          event === 'RULE_PROVIDER_SELECTED'
        ) {
          ruleMatched = 'Yes'
          if (parsed.routingRuleId) ruleId = parsed.routingRuleId
          if (parsed.routingRuleProvider) ruleProvider = parsed.routingRuleProvider
        }
        if (parsed.attemptNumber && parsed.attemptNumber > maxAttempt) {
          maxAttempt = parsed.attemptNumber
        }

        const isFinalProviderCostEvent =
          event === 'RECHARGE_SUCCESS' ||
          event === 'RULE_MATCHED' ||
          event === 'RULE_PROVIDER_SELECTED' ||
          event === 'LCR_PROVIDER_SELECTED' ||
          event === 'LEAST_COST_SELECTED' ||
          event === 'PRIORITY_SELECTED' ||
          event === 'HIGHEST_MARGIN_SELECTED' ||
          event === 'RETRY_PROVIDER_SELECTED'

        if (isFinalProviderCostEvent) {
          const wholesale = wholesaleFromGroupedLog({
            providerCost: log.providerCost,
            providerCurrency: log.providerCurrency,
            status: log.status,
          })
          if (wholesale.amount != null) {
            resolvedCost = wholesale.amount
            if (wholesale.currency) resolvedProviderCurrency = wholesale.currency
          }
        }

        if ((log.providerName || log.providerCode) && !resolvedProviderName && !resolvedProviderCode) {
          resolvedProviderName = log.providerName ?? resolvedProviderName
          resolvedProviderCode = log.providerCode ?? resolvedProviderCode
        }
        if (log.providerId) resolvedProviderId = log.providerId
        if (log.providerName || log.providerCode) {
          resolvedProviderName = log.providerName ?? resolvedProviderName
          resolvedProviderCode = log.providerCode ?? resolvedProviderCode
        }
        resolvedUserAmount = log.userAmount ?? resolvedUserAmount
        resolvedUserCurrency = log.userCurrency ?? resolvedUserCurrency
        
        if (event === 'RECHARGE_SUCCESS') {
          outcomeStatus = 'success'
          finalLog = log
          resolvedStatus = log.status
          resolvedProviderName = log.providerName ?? resolvedProviderName
          resolvedProviderCode = log.providerCode ?? resolvedProviderCode
          resolvedProviderId = log.providerId ?? resolvedProviderId
          resolvedUserAmount = log.userAmount ?? resolvedUserAmount
          resolvedUserCurrency = log.userCurrency ?? resolvedUserCurrency
        } else if (
          event === 'RECHARGE_FAILED' ||
          event === 'MAX_RETRY_EXCEEDED' ||
          event === 'NO_PROVIDER_MAPPING' ||
          event === 'INTERNAL_PLAN_NOT_FOUND' ||
          event === 'NO_ELIGIBLE_PROVIDER'
        ) {
          outcomeStatus = 'failed'
          finalLog = log
          resolvedStatus = log.status
        }
      } else {
        // Legacy status handling
        if (log.status === 'success' || log.status === 'completed') {
          outcomeStatus = 'success'
        } else if (log.status === 'failed') {
          outcomeStatus = 'failed'
        }
      }
    }

    groupedLogs.push({
      id: finalLog.id,
      transactionId: txId,
      countryId: finalLog.countryId,
      operatorId: finalLog.operatorId,
      productId: finalLog.productId,
      providerId: resolvedProviderId,
      providerCode: resolvedProviderCode,
      providerName: resolvedProviderName,
      routingType: ruleMatched === 'Yes' ? 'RULE' : 'LCR',
      providerCost: resolvedCost,
      providerCurrency: resolvedProviderCurrency,
      userAmount: resolvedUserAmount,
      userCurrency: resolvedUserCurrency,
      fallbackUsed: maxAttempt > 1,
      status: outcomeStatus,
      routingLogStatus: resolvedStatus,
      createdAt: finalLog.createdAt,
      metadata: {
        routingStrategy: strategy,
        ruleMatched,
        ruleId,
        ruleProvider,
        totalAttempts: maxAttempt || 1,
      }
    })
  }

  // Add ungrouped logs
  for (const log of ungrouped) {
    const parsed = parseStatus(log.status)
    groupedLogs.push({
      ...log,
      metadata: {
        routingStrategy: parsed?.routingStrategy ?? 'LCR',
        ruleMatched: parsed?.routingRuleMatched ?? (log.routingType === 'RULE' ? 'Yes' : 'No'),
        ruleId: parsed?.routingRuleId ?? null,
        ruleProvider: parsed?.routingRuleProvider ?? null,
        totalAttempts: parsed?.attemptNumber ?? 1,
      }
    })
  }

  // Sort all grouped and ungrouped logs by createdAt descending
  groupedLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const total = groupedLogs.length
  const paginated = groupedLogs.slice(offset, offset + limit)
  const enriched = await enrichRoutingLogsWithPricing(paginated)
  const withOperatorNames = await enrichRoutingLogsWithOperatorNames(enriched)
  const withPlanNames = await enrichRoutingLogsWithPlanNames(withOperatorNames)

  return NextResponse.json({ logs: withPlanNames, total, limit, offset })
}
