import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { listRoutingLogs, enrichRoutingLogsWithPricing } from '@/lib/routing/repository'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'routing', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
        if (parsed.routingRuleMatched) ruleMatched = parsed.routingRuleMatched
        if (parsed.routingRuleId) ruleId = parsed.routingRuleId
        if (parsed.routingRuleProvider) ruleProvider = parsed.routingRuleProvider
        if (parsed.attemptNumber && parsed.attemptNumber > maxAttempt) {
          maxAttempt = parsed.attemptNumber
        }
        if (typeof parsed.providerCurrency === 'string' && parsed.providerCurrency) {
          resolvedProviderCurrency = String(parsed.providerCurrency).toUpperCase()
        }
        if (typeof parsed.providerCost === 'number' && Number.isFinite(parsed.providerCost)) {
          resolvedCost = parsed.providerCost
        }

        // Keep the latest non-null provider cost and identity from the same routing/attempt event.
        if (log.providerCost != null) {
          resolvedCost = log.providerCost
          resolvedProviderCurrency = log.providerCurrency ?? resolvedProviderCurrency
          resolvedUserAmount = log.userAmount ?? resolvedUserAmount
          resolvedUserCurrency = log.userCurrency ?? resolvedUserCurrency
          if (log.providerId) resolvedProviderId = log.providerId
          if (log.providerName || log.providerCode) {
            resolvedProviderName = log.providerName ?? resolvedProviderName
            resolvedProviderCode = log.providerCode ?? resolvedProviderCode
          }
        } else if ((log.providerName || log.providerCode) && !resolvedProviderName && !resolvedProviderCode) {
          resolvedProviderName = log.providerName ?? resolvedProviderName
          resolvedProviderCode = log.providerCode ?? resolvedProviderCode
        }
        if (log.providerId && !resolvedProviderId) resolvedProviderId = log.providerId
        
        const event = parsed.event
        if (event === 'RECHARGE_SUCCESS') {
          outcomeStatus = 'success'
          finalLog = log
          resolvedStatus = log.status
          resolvedProviderName = log.providerName ?? resolvedProviderName
          resolvedProviderCode = log.providerCode ?? resolvedProviderCode
          resolvedProviderId = log.providerId ?? resolvedProviderId
          resolvedCost = log.providerCost ?? resolvedCost
          resolvedProviderCurrency = log.providerCurrency ?? resolvedProviderCurrency
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

  return NextResponse.json({ logs: enriched, total, limit, offset })
}
