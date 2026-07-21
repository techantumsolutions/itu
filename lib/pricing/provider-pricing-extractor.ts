export type ExtractedPricing = {
  basePrice: number | null
  providerCost: number | null
  markup: number | null
  platformMarkup: number | null
  fee: number | null
  commission: number | null
  margin: number | null
  tax: number | null
  currency: string | null
  finalPrice: number | null
  min: number | null
  max: number | null
}

type PricingField =
  | 'basePrice'
  | 'providerCost'
  | 'markup'
  | 'platformMarkup'
  | 'fee'
  | 'commission'
  | 'margin'
  | 'tax'
  | 'finalPrice'
  | 'min'
  | 'max'

const FIELD_KEY_ALIASES: Record<PricingField, string[]> = {
  basePrice: [
    'baseprice',
    'base',
    'facevalue',
    'destinationamount',
    'retailamount',
    'retailprice',
    'sellingprice',
    'amount',
    'price',
    'operatorprice',
    'value',
  ],
  providerCost: [
    'providercost',
    'wholesaleprice',
    'wholesale',
    'cost',
    'operatorcost',
    'sourceamount',
    'purchaseprice',
    'netprice',
  ],
  markup: ['markup', 'providermarkup', 'sellermarkup'],
  platformMarkup: ['platformmarkup', 'platformfee', 'servicefee', 'adminfee'],
  fee: ['fee', 'fees', 'transactionfee', 'processingfee', 'handlingfee'],
  commission: ['commission', 'commissions', 'agentcommission'],
  margin: ['margin', 'profitmargin', 'grossmargin'],
  tax: ['tax', 'taxes', 'vat', 'gst', 'salestax'],
  finalPrice: ['finalprice', 'totalprice', 'totalamount', 'grandtotal', 'checkoutprice', 'customerprice'],
  min: ['min', 'minimum', 'minamount', 'minsendamount', 'minreceiveamount'],
  max: ['max', 'maximum', 'maxamount', 'maxsendamount', 'maxreceiveamount'],
}

const CURRENCY_KEY_ALIASES = new Set([
  'currency',
  'currencycode',
  'currencyunit',
  'unit',
  'retailcurrency',
  'destinationcurrency',
  'sourcecurrency',
  'sendcurrency',
  'receivecurrency',
])

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    const amount = obj.amount ?? obj.value ?? obj.base ?? obj.total
    return toNumber(amount)
  }
  return null
}

function toCurrency(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase()
  return null
}

function fieldForKey(normalized: string): PricingField | null {
  for (const [field, aliases] of Object.entries(FIELD_KEY_ALIASES) as [PricingField, string[]][]) {
    if (aliases.includes(normalized)) return field
  }
  return null
}

function assignField(
  target: ExtractedPricing,
  field: PricingField,
  value: number | null,
): void {
  if (value == null || target[field] != null) return
  target[field] = value
}

function walk(
  node: unknown,
  target: ExtractedPricing,
  depth: number,
): void {
  if (node == null || depth > 12) return

  if (Array.isArray(node)) {
    for (const item of node) walk(item, target, depth + 1)
    return
  }

  if (typeof node !== 'object') return

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const normalized = normalizeKey(key)

    if (CURRENCY_KEY_ALIASES.has(normalized) && !target.currency) {
      const currency = toCurrency(value)
      if (currency) target.currency = currency
    }

    const field = fieldForKey(normalized)
    if (field) {
      assignField(target, field, toNumber(value))
    }

    if (value && typeof value === 'object') {
      walk(value, target, depth + 1)
    }
  }
}

export function extractPricingFromRaw(raw: unknown): ExtractedPricing {
  const result: ExtractedPricing = {
    basePrice: null,
    providerCost: null,
    markup: null,
    platformMarkup: null,
    fee: null,
    commission: null,
    margin: null,
    tax: null,
    currency: null,
    finalPrice: null,
    min: null,
    max: null,
  }

  try {
    walk(raw, result, 0)
  } catch {
    /* never crash on malformed provider payloads */
  }

  if (result.finalPrice == null) {
    const parts = [result.providerCost, result.markup, result.fee, result.tax, result.commission].filter(
      (v): v is number => v != null,
    )
    if (parts.length > 0) {
      result.finalPrice = parts.reduce((sum, n) => sum + n, 0)
    } else if (result.basePrice != null) {
      result.finalPrice = result.basePrice
    }
  }

  return result
}

export function formatMoney(amount: number | null | undefined, currency?: string | null): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  const formatted = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return currency ? `${formatted} ${currency}` : formatted
}
