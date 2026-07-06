import { supabaseRest } from '@/lib/db/supabase-rest'
import { buildRechargeCheckoutSummary } from '@/lib/admin/recharge-checkout-summary'
import { extractPlanIdFromSources, resolvePlanNameMap } from '@/lib/admin/plan-name-resolver'
import { translatePlanTextToEnglish } from '@/lib/catalog/plan-text-english'
import { buildInternationalMobile, countryDisplayName } from '@/lib/lcr/countries'

function enc(value: string): string {
  return encodeURIComponent(value)
}

function numberFrom(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export type RechargeReceiptData = {
  receiptNumber: string
  transactionId: string | null
  issuedAt: string
  status: 'paid' | 'pending' | 'failed'
  statusLabel: string
  mobileNumber: string
  countryCode: string
  countryName: string
  operator: string
  planId: string
  planName: string
  planValue: string
  planPrice: number
  planPriceCurrency: string
  serviceFee: number
  tax: number
  totalPaid: number
  paymentCurrency: string
  paymentMethod: string
  providerName: string | null
  providerRef: string | null
}

type ReceiptRow = {
  id: string
  transaction_id?: string | null
  phone_number: string
  operator_name?: string | null
  operator_code?: string | null
  country_iso?: string | null
  sku_code?: string | null
  plan_id?: string | null
  product_name?: string | null
  send_amount?: number | string | null
  send_currency?: string | null
  receive_amount?: number | string | null
  receive_currency?: string | null
  service_fee?: number | string | null
  tax?: number | string | null
  status: string
  provider?: string | null
  provider_ref?: string | null
  metadata?: Record<string, unknown> | null
  created_at: string
  transactions?: Array<{
    id: string
    amount?: number | string | null
    currency?: string | null
    status?: string | null
    metadata?: Record<string, unknown> | null
  }> | null
}

function resolveReceiptStatus(status: string, metadata?: Record<string, unknown>): RechargeReceiptData['status'] {
  const normalized = status.trim().toLowerCase()
  if (metadata?.topup_status === 'success' || normalized === 'completed' || normalized === 'success') {
    return 'paid'
  }
  if (normalized === 'failed' || normalized === 'cancelled' || normalized === 'refunded') {
    return 'failed'
  }
  return 'pending'
}

function formatPlanValue(amount: number, currency: string): string {
  if (amount <= 0) return '—'
  return `${amount.toFixed(2)} ${currency}`
}

export async function loadRechargeReceiptData(orderId: string): Promise<RechargeReceiptData | null> {
  const res = await supabaseRest(
    `recharge_orders?id=eq.${enc(orderId)}&select=id,transaction_id,phone_number,operator_name,operator_code,country_iso,sku_code,plan_id,product_name,send_amount,send_currency,receive_amount,receive_currency,service_fee,tax,status,provider,provider_ref,metadata,created_at,transactions(id,amount,currency,status,metadata)&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) throw new Error('Failed to load receipt data')

  const rows = (await res.json()) as ReceiptRow[]
  const row = rows[0]
  if (!row) return null

  const transaction = row.transactions?.[0] ?? null
  const metadata = {
    ...(row.metadata ?? {}),
    ...(transaction?.metadata ?? {}),
  }

  const planId = extractPlanIdFromSources({
    planId: row.plan_id,
    skuCode: row.sku_code,
    productName: row.product_name,
    metadata,
  })

  const planNameMap = planId ? await resolvePlanNameMap([planId]) : new Map<string, string>()
  const resolvedPlanName =
    translatePlanTextToEnglish(
      row.product_name?.trim() ||
        (planId ? planNameMap.get(planId) : '') ||
        'Mobile Recharge Plan',
    ) || 'Mobile Recharge Plan'

  const checkout = buildRechargeCheckoutSummary({
    type: 'recharge',
    amount: numberFrom(transaction?.amount ?? row.send_amount),
    currency: String(transaction?.currency ?? row.send_currency ?? 'EUR'),
    metadata,
    planName: resolvedPlanName,
    rechargeOrder: row,
  })

  const countryCode = String(row.country_iso ?? '').trim().toUpperCase()
  const countryName = countryCode ? countryDisplayName(countryCode, countryCode) : '—'
  const mobileNumber = countryCode
    ? buildInternationalMobile(countryCode, row.phone_number)
    : row.phone_number

  const receiptStatus = resolveReceiptStatus(row.status, metadata)
  const statusLabel =
    receiptStatus === 'paid' ? 'Paid' : receiptStatus === 'failed' ? 'Failed' : 'Pending'

  const planPrice = checkout?.planPrice ?? numberFrom(row.receive_amount)
  const planPriceCurrency = checkout?.planPriceCurrency ?? String(row.receive_currency ?? row.send_currency ?? 'EUR').toUpperCase()

  return {
    receiptNumber: row.id.slice(0, 8).toUpperCase(),
    transactionId: row.transaction_id ?? transaction?.id ?? null,
    issuedAt: row.created_at,
    status: receiptStatus,
    statusLabel,
    mobileNumber,
    countryCode,
    countryName,
    operator: String(row.operator_name || row.operator_code || '—'),
    planId: planId || '—',
    planName: resolvedPlanName,
    planValue: formatPlanValue(planPrice, planPriceCurrency),
    planPrice,
    planPriceCurrency,
    serviceFee: checkout?.serviceFee ?? numberFrom(row.service_fee),
    tax: checkout?.tax ?? numberFrom(row.tax),
    totalPaid: checkout?.totalPayable ?? numberFrom(row.send_amount ?? transaction?.amount),
    paymentCurrency: checkout?.paymentCurrency ?? String(row.send_currency ?? transaction?.currency ?? 'EUR').toUpperCase(),
    paymentMethod: checkout?.paymentMethod ?? '—',
    providerName: row.provider?.trim() || null,
    providerRef: row.provider_ref?.trim() || null,
  }
}
