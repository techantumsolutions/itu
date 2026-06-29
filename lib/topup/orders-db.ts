import { supabaseRest } from '@/lib/db/supabase-rest'

export type TopupOrderStatus = 'pending' | 'success' | 'failed'

export type TopupOrderRecord = {
  id: string
  phone_number: string
  operator: string
  country: string
  plan_id: string
  amount: number
  fee: number
  service_fee?: number
  tax?: number
  total: number
  currency: string
  status: TopupOrderStatus
  payment_gateway: string | null
  razorpay_order_id?: string
  razorpay_payment_id?: string
  created_at: string
}

function encode(value: string): string {
  return encodeURIComponent(value)
}

function dbStatus(status: TopupOrderStatus): string {
  if (status === 'success') return 'completed'
  if (status === 'failed') return 'failed'
  return 'pending'
}

function apiStatus(status: string, metadata?: Record<string, unknown>): TopupOrderStatus {
  if (metadata?.topup_status === 'success' || status === 'completed') return 'success'
  if (metadata?.topup_status === 'failed' || status === 'failed') return 'failed'
  return 'pending'
}

type OrderRow = {
  id: string
  phone_number: string
  operator_code: string | null
  operator_name: string | null
  country_iso: string | null
  sku_code: string | null
  send_amount: number | string | null
  send_currency: string | null
  status: string
  metadata: Record<string, unknown> | null
  created_at: string
  service_fee?: number | null
  tax?: number | null
}

function numberFrom(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toOrder(row: OrderRow): TopupOrderRecord {
  const metadata = row.metadata ?? {}
  const serviceFee = row.service_fee != null ? numberFrom(row.service_fee) : numberFrom(metadata.fee)
  const tax = row.tax != null ? numberFrom(row.tax) : 0
  const amount = numberFrom(metadata.amount ?? (Number(row.send_amount) - serviceFee - tax))
  return {
    id: row.id,
    phone_number: row.phone_number,
    operator: String(row.operator_name || row.operator_code || ''),
    country: String(row.country_iso || ''),
    plan_id: String(row.sku_code || ''),
    amount: amount,
    fee: serviceFee + tax,
    service_fee: serviceFee,
    tax: tax,
    total: numberFrom(metadata.total ?? row.send_amount),
    currency: String(row.send_currency || metadata.currency || 'EUR'),
    status: apiStatus(row.status, metadata),
    payment_gateway: typeof metadata.payment_gateway === 'string' ? metadata.payment_gateway : null,
    razorpay_order_id: typeof metadata.razorpay_order_id === 'string' ? metadata.razorpay_order_id : undefined,
    razorpay_payment_id: typeof metadata.razorpay_payment_id === 'string' ? metadata.razorpay_payment_id : undefined,
    created_at: row.created_at,
  }
}

async function insertTransaction(input: Omit<TopupOrderRecord, 'id' | 'created_at'>): Promise<string | null> {
  const res = await supabaseRest('transactions?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        type: 'topup',
        amount: input.total,
        currency: input.currency,
        status: dbStatus(input.status),
        description: `Top-up ${input.phone_number}`,
        metadata: {
          phone_number: input.phone_number,
          operator: input.operator,
          country: input.country,
          plan_id: input.plan_id,
          amount: input.amount,
          fee: input.fee,
          total: input.total,
          payment_gateway: input.payment_gateway,
          topup_status: input.status,
        },
      },
    ]),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

export async function createOrderDb(input: Omit<TopupOrderRecord, 'id' | 'created_at'>): Promise<TopupOrderRecord> {
  const transactionId = await insertTransaction(input)
  const res = await supabaseRest(
    'recharge_orders?select=id,phone_number,operator_code,operator_name,country_iso,sku_code,send_amount,send_currency,status,metadata,created_at',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([
        {
          transaction_id: transactionId,
          phone_number: input.phone_number,
          operator_code: input.operator,
          operator_name: input.operator,
          country_iso: input.country,
          sku_code: input.plan_id,
          send_amount: input.total,
          send_currency: input.currency,
          status: dbStatus(input.status),
          service_fee: input.fee,
          tax: 0,
          metadata: {
            amount: input.amount,
            fee: input.fee,
            total: input.total,
            currency: input.currency,
            payment_gateway: input.payment_gateway,
            topup_status: input.status,
          },
        },
      ]),
    },
  )
  if (!res.ok) throw new Error('Failed to create order')
  const rows = (await res.json()) as OrderRow[]
  return toOrder(rows[0]!)
}

export async function getOrderDb(id: string): Promise<TopupOrderRecord | null> {
  const res = await supabaseRest(
    `recharge_orders?id=eq.${encode(id)}&select=id,phone_number,operator_code,operator_name,country_iso,sku_code,send_amount,send_currency,status,metadata,created_at,service_fee,tax&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) throw new Error('Failed to load order')
  const rows = (await res.json()) as OrderRow[]
  return rows[0] ? toOrder(rows[0]) : null
}

export async function updateOrderDb(
  id: string,
  patch: Partial<Pick<TopupOrderRecord, 'status' | 'payment_gateway' | 'razorpay_order_id' | 'razorpay_payment_id'>>,
): Promise<TopupOrderRecord | null> {
  const existing = await getOrderDb(id)
  if (!existing) return null

  const metadata = {
    amount: existing.amount,
    fee: existing.fee,
    total: existing.total,
    currency: existing.currency,
    payment_gateway: patch.payment_gateway ?? existing.payment_gateway,
    razorpay_order_id: patch.razorpay_order_id ?? existing.razorpay_order_id,
    razorpay_payment_id: patch.razorpay_payment_id ?? existing.razorpay_payment_id,
    topup_status: patch.status ?? existing.status,
  }

  const res = await supabaseRest(
    `recharge_orders?id=eq.${encode(id)}&select=id,phone_number,operator_code,operator_name,country_iso,sku_code,send_amount,send_currency,status,metadata,created_at`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: dbStatus(patch.status ?? existing.status),
        metadata,
      }),
    },
  )
  if (!res.ok) throw new Error('Failed to update order')
  const rows = (await res.json()) as OrderRow[]
  return rows[0] ? toOrder(rows[0]) : null
}
