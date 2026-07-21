/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { mergeRoutingLogPricing, parseRoutingLogStatus, formatProviderCostDual } from '@/lib/routing/log-pricing'
import {
  batchLoadInternalPlanRechargeValues,
  batchLoadLegacySkuRechargeValues,
  batchLoadSystemPlanRechargeValues,
  type PlanRechargeValue,
} from '@/lib/catalog/plan-recharge-value'
import { planMappingPricingKey } from '@/lib/catalog/provider-wholesale-pricing'
import { batchResolvePlanMappingPricing } from '@/lib/routing/plan-mapping-pricing'
import {
  authoritativePricingKey,
  resolveProviderPricingForInternalPlan,
  resolveProviderPricingForSystemPlan,
} from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import { logAuthoritativeMappingMissing } from '@/lib/catalog/system-plan-pricing-consistency'
import type { ProviderPricingDebugMeta } from '@/lib/catalog/provider-pricing-debug'
import type {
  LcrEngineSettings,
  ProviderPriorityRow,
  RoutingLogRow,
  RoutingRuleRow,
  RoutingStrategy,
  FallbackStrategy,
} from '@/lib/routing/types'
import { SYSTEM_OPERATOR_UUID_RE, enc, parseRoutingLogOperatorRef, routingLogSystemPlanId } from './shared'
import type { EvaluatedProviderAuditRow, RoutingAuditAttempt, RoutingAuditDetail } from './types'

export function mapRoutingLogRow(row: Record<string, unknown>): RoutingLogRow {
  const prov = row.lcr_providers as { code?: string; name?: string } | null
  const status = String(row.status ?? 'SELECTED')
  const meta = parseRoutingLogStatus(status)
  const pricing = mergeRoutingLogPricing({
    providerCost: row.provider_cost != null ? Number(row.provider_cost) : null,
    providerId: row.provider_id != null ? String(row.provider_id) : null,
    providerName: prov?.name,
    status,
  })

  const wholesaleAmount =
    typeof meta.provider_wholesale_amount === 'number'
      ? meta.provider_wholesale_amount
      : pricing.providerCost
  const wholesaleCurrency =
    typeof meta.provider_wholesale_currency === 'string'
      ? meta.provider_wholesale_currency
      : pricing.providerCurrency

  return {
    id: String(row.id),
    transactionId: row.transaction_id != null ? String(row.transaction_id) : null,
    countryId: row.country_id != null ? String(row.country_id) : null,
    operatorId: row.operator_id != null ? String(row.operator_id) : null,
    productId: row.product_id != null ? String(row.product_id) : null,
    providerId: row.provider_id != null ? String(row.provider_id) : null,
    providerCode: prov?.code,
    providerName: prov?.name,
    routingType: String(row.routing_type ?? 'LCR') as RoutingLogRow['routingType'],
    providerCost: wholesaleAmount,
    providerCurrency: wholesaleCurrency,
    providerWholesaleAmount: wholesaleAmount,
    providerWholesaleCurrency: wholesaleCurrency,
    destinationFaceValue:
      typeof meta.destination_face_value === 'number' ? meta.destination_face_value : null,
    destinationCurrency:
      typeof meta.destination_currency === 'string' ? meta.destination_currency : null,
    normalizedProviderPrice:
      typeof meta.normalized_provider_price === 'number' ? meta.normalized_provider_price : null,
    userAmount: pricing.userAmount,
    userCurrency: pricing.userCurrency,
    fallbackUsed: Boolean(row.fallback_used),
    status,
    createdAt: String(row.created_at ?? ''),
  }
}

export async function enrichRoutingLogsWithPricing<T extends RoutingLogRow>(logs: T[]): Promise<T[]> {
  const transactionIds = Array.from(
    new Set(logs.map((log) => log.transactionId).filter((id): id is string => Boolean(id))),
  )

  const attemptByRef = new Map<
    string,
    {
      send_amount: number | null
      currency: string | null
      routing_decision: unknown
      selected_provider_id: string | null
      selected_provider_plan_id: string | null
      internal_plan_id: string | null
    }
  >()
  const transactionById = new Map<string, { amount: number | null; currency: string | null }>()

  if (transactionIds.length) {
    for (let i = 0; i < transactionIds.length; i += 50) {
      const chunk = transactionIds.slice(i, i + 50)
      const [attemptRes, txRes] = await Promise.all([
        supabaseRest(
          `lcr_v2_recharge_attempts?distributor_ref=in.(${chunk.map(enc).join(',')})&select=distributor_ref,send_amount,currency,routing_decision,selected_provider_id,selected_provider_plan_id,internal_plan_id`,
          { cache: 'no-store' },
        ),
        supabaseRest(
          `transactions?id=in.(${chunk.map(enc).join(',')})&select=id,amount,currency`,
          { cache: 'no-store' },
        ),
      ])

      if (attemptRes.ok) {
        const rows = (await attemptRes.json()) as Array<{
          distributor_ref: string
          send_amount: number | null
          currency: string | null
          routing_decision: unknown
          selected_provider_id: string | null
          selected_provider_plan_id: string | null
          internal_plan_id: string | null
        }>
        for (const row of rows) {
          attemptByRef.set(row.distributor_ref, row)
        }
      }

      if (txRes.ok) {
        const rows = (await txRes.json()) as Array<{ id: string; amount: number | null; currency: string | null }>
        for (const row of rows) {
          transactionById.set(row.id, { amount: row.amount, currency: row.currency })
        }
      }
    }
  }

  const planMappingLookups = logs
    .map((log) => {
      const attempt = log.transactionId ? attemptByRef.get(log.transactionId) : undefined
      const providerId = log.providerId ?? attempt?.selected_provider_id ?? null
      const providerPlanId = attempt?.selected_provider_plan_id ?? null
      const routingLogStatus = (log as RoutingLogRow & { routingLogStatus?: string }).routingLogStatus
      const planId =
        routingLogSystemPlanId(attempt, routingLogStatus ?? log.status) ??
        log.productId ??
        attempt?.internal_plan_id ??
        null
      if (!planId || !providerId) return null
      return { planId, providerId, providerPlanId }
    })
    .filter((row): row is { planId: string; providerId: string; providerPlanId: string | null } => Boolean(row))

  const wholesaleByKey = await batchResolvePlanMappingPricing(planMappingLookups)

  const authoritativeByPlanId = new Map<
    string,
    Awaited<ReturnType<typeof resolveProviderPricingForInternalPlan>>
  >()
  const planIdsToLoad = new Set<string>()
  for (const log of logs) {
    const attempt = log.transactionId ? attemptByRef.get(log.transactionId) : undefined
    const routingLogStatus = (log as RoutingLogRow & { routingLogStatus?: string }).routingLogStatus
    const planId =
      routingLogSystemPlanId(attempt, routingLogStatus ?? log.status) ??
      log.productId ??
      attempt?.internal_plan_id ??
      null
    if (planId) planIdsToLoad.add(planId)
  }
  for (const planId of planIdsToLoad) {
    const asSystem = await resolveProviderPricingForSystemPlan(planId).catch(() => null)
    const resolution = asSystem ?? (await resolveProviderPricingForInternalPlan(planId))
    if (resolution) authoritativeByPlanId.set(planId, resolution)
  }

  return logs.map((log) => {
    const attempt = log.transactionId ? attemptByRef.get(log.transactionId) : undefined
    const tx = log.transactionId ? transactionById.get(log.transactionId) : undefined
    const providerId = log.providerId ?? attempt?.selected_provider_id ?? null
    const providerPlanId = attempt?.selected_provider_plan_id ?? null
    const routingLogStatus = (log as RoutingLogRow & { routingLogStatus?: string }).routingLogStatus
    const planIdForPricing =
      routingLogSystemPlanId(attempt, routingLogStatus ?? log.status) ??
      log.productId ??
      attempt?.internal_plan_id ??
      null

    const authoritative = planIdForPricing ? authoritativeByPlanId.get(planIdForPricing) : undefined
    const authRow =
      planIdForPricing && providerId
        ? (providerPlanId
            ? authoritative?.byKey.get(authoritativePricingKey(providerId, providerPlanId))
            : null) ?? authoritative?.byProviderId.get(providerId)
        : undefined

    if (planIdForPricing && providerId && !authRow) {
      logAuthoritativeMappingMissing({
        context: 'enrichRoutingLogsWithPricing',
        internalPlanId: planIdForPricing,
        providerId,
        providerName: log.providerName,
        providerPlanId,
      })
    }

    const resolvedWholesale =
      authRow != null
        ? {
            wholesaleAmount: authRow.provider_wholesale_amount,
            wholesaleCurrency: authRow.provider_wholesale_currency,
            destinationAmount: authRow.destination_face_value,
            destinationCurrency: authRow.destination_currency,
          }
        : planIdForPricing && providerId
          ? wholesaleByKey.get(planMappingPricingKey(planIdForPricing, providerId, providerPlanId)) ??
            wholesaleByKey.get(planMappingPricingKey(planIdForPricing, providerId, null))
          : undefined

    const pricingSource: ProviderPricingDebugMeta | undefined = authRow
      ? {
          providerName: authRow.providerName,
          providerPlanId: authRow.providerPlanId,
          providerPlanRawId: authRow.providerPlanRawId,
          provider_wholesale_amount: authRow.provider_wholesale_amount,
          provider_wholesale_currency: authRow.provider_wholesale_currency,
          destination_face_value: authRow.destination_face_value,
          destination_currency: authRow.destination_currency,
          sourceTable: authRow.sourceTable,
          sourceFile: authRow.sourceFile,
          sourceQuery: authRow.sourceQuery,
          existsInPlanMappings: true,
        }
      : providerId
        ? {
            providerName: log.providerName ?? providerId,
            providerPlanId,
            providerPlanRawId: null,
            provider_wholesale_amount: resolvedWholesale?.wholesaleAmount ?? log.providerCost ?? null,
            provider_wholesale_currency:
              resolvedWholesale?.wholesaleCurrency ?? log.providerCurrency ?? null,
            destination_face_value: resolvedWholesale?.destinationAmount ?? log.destinationFaceValue ?? null,
            destination_currency: resolvedWholesale?.destinationCurrency ?? log.destinationCurrency ?? null,
            sourceTable: null,
            sourceFile: null,
            sourceQuery: null,
            existsInPlanMappings: false,
            orphanInternalMapping: true,
          }
        : undefined

    const pricing = mergeRoutingLogPricing(
      {
        providerCost: resolvedWholesale?.wholesaleAmount ?? log.providerCost ?? null,
        providerId,
        providerName: log.providerName,
        status: (log as RoutingLogRow & { routingLogStatus?: string }).routingLogStatus ?? log.status,
      },
      {
        userAmount: attempt?.send_amount ?? tx?.amount ?? log.userAmount ?? null,
        userCurrency: attempt?.currency ?? tx?.currency ?? log.userCurrency ?? null,
        providerCost: resolvedWholesale?.wholesaleAmount ?? log.providerCost ?? null,
        routingDecision: attempt?.routing_decision,
        providerCurrency: resolvedWholesale?.wholesaleCurrency ?? log.providerCurrency ?? null,
      },
    )

    const dual = formatProviderCostDual(
      resolvedWholesale?.wholesaleAmount ?? pricing.providerCost,
      resolvedWholesale?.wholesaleCurrency ?? pricing.providerCurrency,
    )

    return {
      ...log,
      providerId: providerId ?? log.providerId,
      userAmount: pricing.userAmount,
      userCurrency: pricing.userCurrency,
      providerCost: resolvedWholesale?.wholesaleAmount ?? pricing.providerCost,
      providerCurrency: resolvedWholesale?.wholesaleCurrency ?? pricing.providerCurrency,
      providerWholesaleAmount: resolvedWholesale?.wholesaleAmount ?? log.providerWholesaleAmount ?? pricing.providerCost,
      providerWholesaleCurrency:
        resolvedWholesale?.wholesaleCurrency ?? log.providerWholesaleCurrency ?? pricing.providerCurrency,
      destinationFaceValue: resolvedWholesale?.destinationAmount ?? log.destinationFaceValue ?? null,
      destinationCurrency: resolvedWholesale?.destinationCurrency ?? log.destinationCurrency ?? null,
      normalizedProviderPrice: log.normalizedProviderPrice ?? null,
      providerCostEur: dual.providerCostEur,
      providerCostInr: dual.providerCostInr,
      providerCostDisplay: dual.providerCostDisplay,
      providerDestinationAmount: resolvedWholesale?.destinationAmount ?? null,
      providerDestinationCurrency: resolvedWholesale?.destinationCurrency ?? null,
      pricingSource,
    }
  })
}

export async function enrichRoutingLogsWithOperatorNames<T extends RoutingLogRow>(
  logs: T[],
): Promise<(T & { operatorName: string | null })[]> {
  if (logs.length === 0) return []

  const uuidSet = new Set<string>()
  const countrySet = new Set<string>()

  for (const log of logs) {
    const { uuid } = parseRoutingLogOperatorRef(log.operatorId)
    if (uuid) uuidSet.add(uuid)
    const country = log.countryId?.trim().toUpperCase()
    if (country) countrySet.add(country)
  }

  const nameByUuid = new Map<string, string>()
  const uuidList = [...uuidSet]
  for (let i = 0; i < uuidList.length; i += 50) {
    const chunk = uuidList.slice(i, i + 50)
    const res = await supabaseRest(
      `system_operators?id=in.(${chunk.map(enc).join(',')})&select=id,system_operator_name,slug`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{
      id: string
      system_operator_name?: string | null
      slug?: string | null
    }>
    for (const row of rows) {
      const name = String(row.system_operator_name ?? row.slug ?? row.id)
      nameByUuid.set(String(row.id), name)
    }
  }

  const nameByCountrySlug = new Map<string, string>()
  const nameByCountryName = new Map<string, string>()

  for (const country of countrySet) {
    const res = await supabaseRest(
      `system_operators?country_id=eq.${enc(country)}&select=id,system_operator_name,slug&limit=500`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{
      id: string
      system_operator_name?: string | null
      slug?: string | null
    }>
    for (const row of rows) {
      const name = String(row.system_operator_name ?? row.slug ?? row.id)
      nameByUuid.set(String(row.id), name)
      const slug = String(row.slug ?? '').trim().toLowerCase()
      if (slug) nameByCountrySlug.set(`${country}:${slug}`, name)
      const opName = String(row.system_operator_name ?? '').trim().toLowerCase()
      if (opName) nameByCountryName.set(`${country}:${opName}`, name)
    }
  }

  return logs.map((log) => {
    const { uuid, raw } = parseRoutingLogOperatorRef(log.operatorId)
    let operatorName: string | null = null

    if (uuid && nameByUuid.has(uuid)) {
      operatorName = nameByUuid.get(uuid)!
    } else {
      const country = log.countryId?.trim().toUpperCase()
      const ref = raw?.trim().toLowerCase()
      if (country && ref) {
        operatorName =
          nameByCountrySlug.get(`${country}:${ref}`) ??
          nameByCountryName.get(`${country}:${ref}`) ??
          null
      }
      if (!operatorName && raw && !uuid) {
        operatorName = raw
      }
    }

    return { ...log, operatorName }
  })
}

async function batchResolvePlanDisplayNames(planIds: string[]): Promise<Map<string, string>> {
  const nameByPlanRef = new Map<string, string>()
  const unique = [...new Set(planIds.map((id) => id.trim()).filter(Boolean))]
  if (!unique.length) return nameByPlanRef

  const uuidRefs = unique.filter((id) => SYSTEM_OPERATOR_UUID_RE.test(id))
  const nonUuidRefs = unique.filter((id) => !SYSTEM_OPERATOR_UUID_RE.test(id))

  for (let i = 0; i < uuidRefs.length; i += 50) {
    const chunk = uuidRefs.slice(i, i + 50)
    const res = await supabaseRest(
      `system_plans?id=in.(${chunk.map(enc).join(',')})&select=id,system_plan_name,internal_plan_id`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{
      id: string
      system_plan_name?: string | null
      internal_plan_id?: string | null
    }>
    for (const row of rows) {
      const name = String(row.system_plan_name ?? '').trim()
      if (!name) continue
      nameByPlanRef.set(row.id, name)
      if (row.internal_plan_id) {
        nameByPlanRef.set(String(row.internal_plan_id), name)
      }
    }
  }

  const unresolvedUuids = uuidRefs.filter((id) => !nameByPlanRef.has(id))
  for (let i = 0; i < unresolvedUuids.length; i += 50) {
    const chunk = unresolvedUuids.slice(i, i + 50)
    const res = await supabaseRest(
      `system_plans?internal_plan_id=in.(${chunk.map(enc).join(',')})&select=id,internal_plan_id,system_plan_name`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{
      id: string
      internal_plan_id?: string | null
      system_plan_name?: string | null
    }>
    for (const row of rows) {
      const internalId = row.internal_plan_id ? String(row.internal_plan_id) : null
      const name = String(row.system_plan_name ?? '').trim()
      if (!name || !internalId) continue
      nameByPlanRef.set(internalId, name)
      nameByPlanRef.set(row.id, name)
    }
  }

  const internalUnresolved = uuidRefs.filter((id) => !nameByPlanRef.has(id))
  for (let i = 0; i < internalUnresolved.length; i += 50) {
    const chunk = internalUnresolved.slice(i, i + 50)
    const res = await supabaseRest(
      `internal_plans?id=in.(${chunk.map(enc).join(',')})&select=id,uti_plan_name`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{ id: string; uti_plan_name?: string | null }>
    for (const row of rows) {
      const name = String(row.uti_plan_name ?? '').trim()
      if (name) nameByPlanRef.set(String(row.id), name)
    }
  }

  const skuRefs = [...nonUuidRefs, ...uuidRefs.filter((id) => !nameByPlanRef.has(id))]
  const uniqueSkuRefs = [...new Set(skuRefs)]
  for (let i = 0; i < uniqueSkuRefs.length; i += 50) {
    const chunk = uniqueSkuRefs.slice(i, i + 50)
    const res = await supabaseRest(
      `plans?sku_code=in.(${chunk.map(enc).join(',')})&select=sku_code,plan_name`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{ sku_code?: string | null; plan_name?: string | null }>
    for (const row of rows) {
      const sku = String(row.sku_code ?? '').trim()
      const name = String(row.plan_name ?? '').trim()
      if (sku && name) nameByPlanRef.set(sku, name)
    }
  }

  return nameByPlanRef
}

function planNameFromRefs(
  refs: Array<string | null | undefined>,
  nameByRef: Map<string, string>,
): string | null {
  for (const ref of refs) {
    const key = ref?.trim()
    if (!key) continue
    const name = nameByRef.get(key)
    if (name) return name
  }
  return null
}

function collectPlanRefsForLog(
  log: RoutingLogRow,
  attempt: { internal_plan_id: string | null; routing_decision: unknown } | undefined,
  planRefsByTx: Map<string, string[]>,
): string[] {
  const routingStatus = (log as RoutingLogRow & { routingLogStatus?: string }).routingLogStatus
  const refs = [
    routingLogSystemPlanId(attempt, routingStatus ?? log.status),
    attempt?.internal_plan_id,
    ...(log.transactionId ? planRefsByTx.get(log.transactionId) ?? [] : []),
    log.productId,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const ref of refs) {
    const key = ref?.trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function planRechargeFromRefs(
  refs: string[],
  systemRecharge: Map<string, PlanRechargeValue>,
  internalRecharge: Map<string, PlanRechargeValue>,
  skuRecharge: Map<string, PlanRechargeValue>,
): PlanRechargeValue | null {
  for (const ref of refs) {
    const hit = systemRecharge.get(ref) ?? internalRecharge.get(ref) ?? skuRecharge.get(ref)
    if (hit) return hit
  }
  return null
}

function planRechargeFromLogFaceValue(log: RoutingLogRow): PlanRechargeValue | null {
  const amount = log.destinationFaceValue ?? log.providerDestinationAmount ?? null
  const currency = log.destinationCurrency ?? log.providerDestinationCurrency ?? null
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return null
  const code = String(currency ?? '').trim().toUpperCase()
  if (!code) return null
  return { amount, currency: code }
}

export async function enrichRoutingLogsWithPlanNames<T extends RoutingLogRow>(
  logs: T[],
): Promise<(T & { planName: string | null; planRechargeAmount: number | null; planRechargeCurrency: string | null })[]> {
  if (logs.length === 0) return []

  const transactionIds = [
    ...new Set(logs.map((log) => log.transactionId).filter((id): id is string => Boolean(id))),
  ]

  const attemptByRef = new Map<
    string,
    { internal_plan_id: string | null; routing_decision: unknown }
  >()
  const productNameByTx = new Map<string, string>()
  const extraPlanRefs: string[] = []
  const planRefsByTx = new Map<string, string[]>()

  for (let i = 0; i < transactionIds.length; i += 50) {
    const chunk = transactionIds.slice(i, i + 50)
    const [attemptRes, orderRes, txRes] = await Promise.all([
      supabaseRest(
        `lcr_v2_recharge_attempts?distributor_ref=in.(${chunk.map(enc).join(',')})&select=distributor_ref,internal_plan_id,routing_decision`,
        { cache: 'no-store' },
      ),
      supabaseRest(
        `recharge_orders?transaction_id=in.(${chunk.map(enc).join(',')})&select=transaction_id,product_name,sku_code,plan_id`,
        { cache: 'no-store' },
      ),
      supabaseRest(
        `transactions?id=in.(${chunk.map(enc).join(',')})&select=id,metadata`,
        { cache: 'no-store' },
      ),
    ])

    if (attemptRes.ok) {
      const rows = (await attemptRes.json()) as Array<{
        distributor_ref: string
        internal_plan_id: string | null
        routing_decision: unknown
      }>
      for (const row of rows) {
        attemptByRef.set(row.distributor_ref, {
          internal_plan_id: row.internal_plan_id,
          routing_decision: row.routing_decision,
        })
        if (row.internal_plan_id?.trim()) extraPlanRefs.push(row.internal_plan_id.trim())
        const systemPlanId = routingLogSystemPlanId(row, null)
        if (systemPlanId) extraPlanRefs.push(systemPlanId)
      }
    }

    if (orderRes.ok) {
      const rows = (await orderRes.json()) as Array<{
        transaction_id: string
        product_name?: string | null
        sku_code?: string | null
        plan_id?: string | null
      }>
      for (const row of rows) {
        const txId = String(row.transaction_id ?? '').trim()
        const productName = String(row.product_name ?? '').trim()
        if (txId && productName) productNameByTx.set(txId, productName)
        if (row.plan_id?.trim()) extraPlanRefs.push(row.plan_id.trim())
        if (row.sku_code?.trim()) extraPlanRefs.push(row.sku_code.trim())
      }
    }

    if (txRes.ok) {
      const rows = (await txRes.json()) as Array<{
        id: string
        metadata?: Record<string, unknown> | null
      }>
      for (const row of rows) {
        const txId = String(row.id ?? '').trim()
        if (!txId) continue
        const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        const refs: string[] = []
        const planId = typeof meta.plan_id === 'string' ? meta.plan_id.trim() : ''
        const systemPlanId = typeof meta.system_plan_id === 'string' ? meta.system_plan_id.trim() : ''
        if (systemPlanId) {
          refs.push(systemPlanId)
          extraPlanRefs.push(systemPlanId)
        }
        if (planId) {
          refs.push(planId)
          extraPlanRefs.push(planId)
        }
        if (refs.length) planRefsByTx.set(txId, refs)
      }
    }
  }

  const planIds = [
    ...logs.map((log) => log.productId).filter((id): id is string => Boolean(id?.trim())),
    ...extraPlanRefs,
  ]
  const nameByRef = await batchResolvePlanDisplayNames(planIds)

  const allPlanRefs = new Set<string>()
  for (const log of logs) {
    const attempt = log.transactionId ? attemptByRef.get(log.transactionId) : undefined
    for (const ref of collectPlanRefsForLog(log, attempt, planRefsByTx)) {
      allPlanRefs.add(ref)
    }
  }
  const refList = [...allPlanRefs]
  const uuidRefs = refList.filter((id) => SYSTEM_OPERATOR_UUID_RE.test(id))
  const nonUuidRefs = refList.filter((id) => !SYSTEM_OPERATOR_UUID_RE.test(id))
  const [systemRecharge, internalRecharge, skuRecharge] = await Promise.all([
    batchLoadSystemPlanRechargeValues(uuidRefs),
    batchLoadInternalPlanRechargeValues(uuidRefs),
    batchLoadLegacySkuRechargeValues(nonUuidRefs),
  ])

  return logs.map((log) => {
    const attempt = log.transactionId ? attemptByRef.get(log.transactionId) : undefined
    const planRefs = collectPlanRefsForLog(log, attempt, planRefsByTx)

    const planName =
      planNameFromRefs(planRefs, nameByRef) ??
      (log.transactionId ? productNameByTx.get(log.transactionId) ?? null : null)

    const recharge =
      planRechargeFromRefs(planRefs, systemRecharge, internalRecharge, skuRecharge) ??
      planRechargeFromLogFaceValue(log)

    return {
      ...log,
      planName,
      planRechargeAmount: recharge?.amount ?? null,
      planRechargeCurrency: recharge?.currency ?? null,
    }
  })
}

function normalizeAuditHop(hop: RoutingAuditAttempt): RoutingAuditAttempt {
  return {
    ...hop,
    providerName: hop.providerName || '—',
    skipped: Boolean(hop.skipped),
    skipReason: hop.skipReason ?? hop.errorMessage ?? (hop.skipped ? hop.error : undefined),
  }
}

/** Overlay skip / pre-validation failures onto evaluated provider snapshots. */

export function mergeEvaluatedProvidersWithSkipEvents(
  base: EvaluatedProviderAuditRow[],
  skipSources: Array<{
    providerId?: string | null
    providerName?: string | null
    skipReason?: string | null
    filterReason?: string | null
    skipped?: boolean
  }>,
): EvaluatedProviderAuditRow[] {
  const result = base.map((ev) => ({ ...ev }))

  const findIndex = (id?: string | null, name?: string | null) =>
    result.findIndex(
      (ev) =>
        (id != null && id !== '' && ev.providerId === id) ||
        (name != null &&
          name !== '' &&
          (ev.providerName === name || ev.provider === name || ev.providerId === name)),
    )

  for (const skip of skipSources) {
    if (!skip.skipped && !skip.skipReason && !skip.filterReason) continue
    const reason = skip.skipReason ?? skip.filterReason ?? 'Skipped'
    const idx = findIndex(skip.providerId, skip.providerName)
    if (idx >= 0) {
      result[idx] = {
        ...result[idx],
        eligibility: false,
        eligible: false,
        skipped: true,
        filterReason: reason,
        reason,
        skipReason: reason,
      }
    } else if (skip.providerId || skip.providerName) {
      result.push({
        providerId: skip.providerId ?? undefined,
        providerName: skip.providerName ?? skip.providerId ?? '—',
        eligibility: false,
        eligible: false,
        skipped: true,
        filterReason: reason,
        reason,
        skipReason: reason,
      })
    }
  }

  return result
}

/** Combine recharge-attempt hops with routing_log skip events (deduped). */

export function mergeRoutingAttempts(
  fromAttempt: RoutingAuditAttempt[],
  fromLogs: RoutingAuditAttempt[],
): RoutingAuditAttempt[] {
  const merged = fromAttempt.map(normalizeAuditHop)
  for (const hop of fromLogs.map(normalizeAuditHop)) {
    const exists = merged.some(
      (h) =>
        h.providerName === hop.providerName &&
        Boolean(h.skipped) === Boolean(hop.skipped) &&
        (h.skipReason ?? h.error ?? '') === (hop.skipReason ?? hop.error ?? ''),
    )
    if (!exists) merged.push(hop)
  }
  return merged
}

export function buildRoutingAuditDetailFromLogs(logs: RoutingLogRow[]): RoutingAuditDetail | null {
  if (!logs.length) return null

  const parsed = logs.map((log) => ({
    log,
    meta: parseRoutingLogStatus(log.status),
    event: String(parseRoutingLogStatus(log.status).event ?? log.status),
  }))

  const first = logs[0]
  const transactionId = first.transactionId ?? first.id

  let routingStrategy = 'LEAST_COST'
  let routingRuleMatched = false
  let routingRuleProvider: string | null = null
  let routingDecisionReason: string | null = null
  let mappingCount = 0
  let selectedProvider: string | null = null

  const evaluatedMap = new Map<
    string,
    {
      providerId: string
      providerName: string
      costPrice: number | null
      currency: string | null
      margin: number | null
      priority: number | null
      eligibility: boolean
      skipped?: boolean
      filterReason: string | null
      skipReason?: string | null
    }
  >()

  const attempts: RoutingAuditDetail['attempts'] = []
  let success = false
  let userAmount: number | null = null
  let userCurrency: string | null = null
  let providerCost: number | null = null
  let providerCurrency: string | null = null

  for (const row of parsed) {
    const { log, meta, event } = row
    if (typeof meta.routingStrategy === 'string') routingStrategy = meta.routingStrategy
    if (meta.routingRuleMatched === 'Yes') routingRuleMatched = true
    if (typeof meta.routingRuleProvider === 'string' && meta.routingRuleProvider) {
      routingRuleProvider = meta.routingRuleProvider
    }
    if (typeof meta.verificationMappingCount === 'number') {
      mappingCount = Math.max(mappingCount, meta.verificationMappingCount)
    }

    if (event === 'LCR_PROVIDER_DISCOVERED' || event === 'LCR_PROVIDER_FILTERED') {
      if (!log.providerId) continue
      evaluatedMap.set(log.providerId, {
        providerId: log.providerId,
        providerName: log.providerName || log.providerCode || log.providerId,
        costPrice: log.providerCost,
        currency: log.providerCurrency ?? (typeof meta.providerCurrency === 'string' ? meta.providerCurrency : null),
        margin: null,
        priority: typeof meta.providerPriority === 'number' ? meta.providerPriority : null,
        eligibility: event === 'LCR_PROVIDER_DISCOVERED',
        filterReason:
          typeof meta.failureReason === 'string'
            ? meta.failureReason
            : event === 'LCR_PROVIDER_FILTERED'
              ? 'FILTERED'
              : null,
      })
    }

    if (
      event === 'HIGHEST_MARGIN_SELECTED' ||
      event === 'LEAST_COST_SELECTED' ||
      event === 'PRIORITY_SELECTED' ||
      event === 'RULE_MATCHED' ||
      event === 'NO_VIABLE_ROUTING_RULE'
    ) {
      if (event === 'RULE_MATCHED') {
        routingRuleMatched = true
        if (typeof meta.routingRuleProvider === 'string' && meta.routingRuleProvider) {
          routingRuleProvider = meta.routingRuleProvider
        }
      }
      routingDecisionReason = event
      selectedProvider = log.providerName || log.providerCode || log.providerId || selectedProvider
    }

    if (meta.routingRuleMatched === 'Yes') {
      routingRuleMatched = true
      if (typeof meta.routingRuleProvider === 'string' && meta.routingRuleProvider) {
        routingRuleProvider = meta.routingRuleProvider
      }
    }

    if (
      event === 'NO_ELIGIBLE_PROVIDER' ||
      event === 'NO_PROVIDER_MAPPING' ||
      event === 'INTERNAL_PLAN_NOT_FOUND' ||
      event === 'RECHARGE_FAILED' ||
      event === 'MAX_RETRY_EXCEEDED'
    ) {
      routingDecisionReason = routingDecisionReason ?? event
    }

    if (event === 'RECHARGE_SUCCESS') {
      success = true
      routingDecisionReason = 'RECHARGE_SUCCESS'
      selectedProvider = log.providerName || log.providerCode || log.providerId || selectedProvider
      providerCost = log.providerCost ?? providerCost
      providerCurrency = log.providerCurrency ?? providerCurrency
      userAmount = log.userAmount ?? userAmount
      userCurrency = log.userCurrency ?? userCurrency
      attempts.push({
        providerName: log.providerName || log.providerCode || '—',
        cost: log.providerCost,
        currency: log.providerCurrency ?? (typeof meta.providerCurrency === 'string' ? meta.providerCurrency : null),
        source: meta.routingRuleMatched === 'Yes' ? 'RULE' : 'LCR',
        ok: true,
      })
    }

    if (event === 'RETRY_FAILOVER' || event === 'RULE_PROVIDER_FAILED') {
      attempts.push({
        providerName: log.providerName || log.providerCode || '—',
        cost: log.providerCost,
        currency: log.providerCurrency ?? (typeof meta.providerCurrency === 'string' ? meta.providerCurrency : null),
        source: event === 'RULE_PROVIDER_FAILED' || meta.routingRuleMatched === 'Yes' ? 'RULE' : 'LCR',
        ok: false,
        error: typeof meta.failureReason === 'string' ? meta.failureReason : event,
        errorCode: typeof meta.responseCode === 'string' ? meta.responseCode : undefined,
        errorMessage: typeof meta.responseMessage === 'string' ? meta.responseMessage : undefined,
      })
    }

    if (event === 'PROVIDER_PRE_VALIDATION_SKIPPED') {
      const skipReason =
        typeof meta.failureReason === 'string'
          ? meta.failureReason
          : typeof meta.responseMessage === 'string'
            ? meta.responseMessage
            : 'Pre-validation skipped'
      const providerKey = log.providerId ?? log.providerName ?? log.providerCode ?? ''
      if (providerKey) {
        if (evaluatedMap.has(providerKey)) {
          const existing = evaluatedMap.get(providerKey)!
          evaluatedMap.set(providerKey, {
            ...existing,
            eligibility: false,
            skipped: true,
            filterReason: skipReason,
            skipReason,
          })
        } else {
          evaluatedMap.set(providerKey, {
            providerId: log.providerId ?? providerKey,
            providerName: log.providerName || log.providerCode || providerKey,
            costPrice: log.providerCost,
            currency:
              log.providerCurrency ?? (typeof meta.providerCurrency === 'string' ? meta.providerCurrency : null),
            margin: null,
            priority: typeof meta.providerPriority === 'number' ? meta.providerPriority : null,
            eligibility: false,
            skipped: true,
            filterReason: skipReason,
            skipReason,
          })
        }
      }
      attempts.push({
        providerName: log.providerName || log.providerCode || '—',
        cost: log.providerCost,
        currency: log.providerCurrency ?? (typeof meta.providerCurrency === 'string' ? meta.providerCurrency : null),
        source: meta.routingRuleMatched === 'Yes' ? 'RULE' : 'LCR',
        ok: false,
        skipped: true,
        skipReason,
        error: typeof meta.responseCode === 'string' ? meta.responseCode : 'PROVIDER_PRE_VALIDATION_SKIPPED',
        errorMessage: skipReason,
      })
    }

    if (event === 'ORPHAN_RUNTIME_PROVIDER') {
      const skipReason =
        typeof meta.failureReason === 'string'
          ? meta.failureReason
          : typeof meta.responseMessage === 'string'
            ? meta.responseMessage
            : 'Orphan runtime provider detected'
      const providerKey = log.providerId ?? log.providerName ?? log.providerCode ?? ''
      if (providerKey) {
        if (evaluatedMap.has(providerKey)) {
          const existing = evaluatedMap.get(providerKey)!
          evaluatedMap.set(providerKey, {
            ...existing,
            eligibility: false,
            skipped: true,
            filterReason: skipReason,
            skipReason,
          })
        } else {
          evaluatedMap.set(providerKey, {
            providerId: log.providerId ?? providerKey,
            providerName: log.providerName || log.providerCode || providerKey,
            costPrice: log.providerCost,
            currency:
              log.providerCurrency ?? (typeof meta.providerCurrency === 'string' ? meta.providerCurrency : null),
            margin: null,
            priority: typeof meta.providerPriority === 'number' ? meta.providerPriority : null,
            eligibility: false,
            skipped: true,
            filterReason: skipReason,
            skipReason,
          })
        }
      }
      attempts.push({
        providerName: log.providerName || log.providerCode || '—',
        cost: log.providerCost,
        currency: log.providerCurrency ?? (typeof meta.providerCurrency === 'string' ? meta.providerCurrency : null),
        source: meta.routingRuleMatched === 'Yes' ? 'RULE' : 'LCR',
        ok: false,
        skipped: true,
        skipReason,
        error: 'ORPHAN_RUNTIME_PROVIDER',
        errorMessage: skipReason,
      })
    }
  }

  const evaluatedProviders = Array.from(evaluatedMap.values())
  const candidateProviderCount = evaluatedProviders.length
  const eligibleProviderCount = evaluatedProviders.filter((p) => p.eligibility).length

  if (!selectedProvider) {
    const priced = evaluatedProviders
      .filter((p) => p.costPrice != null)
      .sort((a, b) => (b.costPrice ?? 0) - (a.costPrice ?? 0))
    selectedProvider = priced[0]?.providerName ?? null
  }

  if (!mappingCount && candidateProviderCount > 0) {
    mappingCount = candidateProviderCount
  }

  return {
    id: first.id,
    distributor_ref: transactionId,
    internal_plan_id: first.productId,
    status: success ? 'success' : 'failed',
    send_amount: userAmount,
    user_currency: userCurrency,
    provider_cost: providerCost,
    provider_currency: providerCurrency,
    routing_decision: {
      routing_strategy: routingStrategy,
      routing_rule_matched: routingRuleMatched,
      routing_rule_provider: routingRuleProvider,
      mapping_count: mappingCount,
      candidate_provider_count: candidateProviderCount,
      eligible_provider_count: eligibleProviderCount,
      selected_provider: selectedProvider,
      routing_decision_reason: routingDecisionReason,
      evaluated_providers: evaluatedProviders,
    },
    attempts,
  }
}
