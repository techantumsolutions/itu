type AdminTransactionSearchRow = {
  id: string
  userId: string
  type: string
  amount: number
  currency: string
  status: string
  displayStatus: string
  description: string
  metadata: Record<string, unknown>
  createdAt: string
  margin?: number
  marginCurrency?: string
  planName?: string
  routingType?: string
  rechargeSummary?: {
    planId: string
    planName: string
    planPrice: number
    planPriceCurrency: string
    totalPayable: number
    paymentCurrency: string
    paymentMethod: string
  } | null
  user?: {
    name: string
    email: string
    phone?: string
    country?: string
  }
  rechargeDetails?: {
    productName: string
    skuCode: string
    provider: string
    operatorName: string
    status: string
    phoneNumber?: string
  } | null
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function formatDateForSearch(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).toLowerCase()
  } catch {
    return ''
  }
}

function formatAmountForSearch(amount: number, currency: string): string[] {
  const fixed = amount.toFixed(2)
  const compact = String(amount)
  return [
    fixed,
    compact,
    `${fixed} ${currency}`.toLowerCase(),
    `${compact} ${currency}`.toLowerCase(),
    currency.toLowerCase(),
  ]
}

/** Match admin transaction rows against a free-text query across all table-visible fields. */
export function matchesAdminTransactionSearch(
  row: AdminTransactionSearchRow,
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const metadata = row.metadata ?? {}
  const recharge = row.rechargeDetails
  const summary = row.rechargeSummary

  const destinationPhone = String(
    metadata.phone_number ??
      metadata.phoneNumber ??
      metadata.mobile_number ??
      recharge?.phoneNumber ??
      '',
  )

  const operatorName = String(
    recharge?.operatorName ??
      metadata.operator_id ??
      metadata.operator ??
      metadata.carrierName ??
      '',
  )

  const providerCandidates = [
    recharge?.provider,
    metadata.provider_code,
    metadata.provider_name,
    metadata.provider,
    (metadata.routing as { selected?: { providerName?: string; providerCode?: string } } | undefined)
      ?.selected?.providerName,
    (metadata.routing as { selected?: { providerName?: string; providerCode?: string } } | undefined)
      ?.selected?.providerCode,
  ]

  const searchableParts = [
    row.id,
    row.id.slice(0, 8),
    row.userId,
    row.type,
    row.status,
    row.displayStatus,
    row.description,
    row.currency,
    row.planName,
    row.routingType,
    row.user?.name,
    row.user?.email,
    row.user?.phone,
    row.user?.country,
    recharge?.productName,
    recharge?.skuCode,
    recharge?.provider,
    recharge?.operatorName,
    recharge?.status,
    recharge?.phoneNumber,
    destinationPhone,
    operatorName,
    metadata.productName,
    metadata.plan_id,
    metadata.planId,
    metadata.system_plan_id,
    metadata.payment_gateway,
    metadata.razorpay_payment_id,
    metadata.payment_order_id,
    metadata.providerRef,
    metadata.country,
    metadata.countryName,
    summary?.planId,
    summary?.planName,
    summary?.paymentMethod,
    summary?.paymentCurrency,
    summary?.planPriceCurrency,
    ...providerCandidates,
    ...formatAmountForSearch(row.amount, row.currency),
    ...(row.margin != null && row.margin > 0
      ? formatAmountForSearch(row.margin, row.marginCurrency ?? 'EUR')
      : []),
    ...(summary?.planPrice != null ? formatAmountForSearch(summary.planPrice, summary.planPriceCurrency) : []),
    ...(summary?.totalPayable != null
      ? formatAmountForSearch(summary.totalPayable, summary.paymentCurrency)
      : []),
    formatDateForSearch(row.createdAt),
  ]

  return searchableParts.some((part) => normalizeSearchText(part).includes(q))
}
