import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

type TransactionRow = {
  id: string
  user_id: string | null
  type: string
  amount: number | string
  currency: string
  status: string
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  profiles: {
    name: string | null
    email: string | null
  } | null
  recharge_orders: Array<{
    product_name: string | null
    sku_code: string | null
    provider: string | null
    operator_name: string | null
    status: string | null
    phone_number: string | null
  }> | null
}

function mapTransaction(row: TransactionRow) {
  const rechargeOrder = row.recharge_orders?.[0] ?? null
  return {
    id: row.id,
    userId: row.user_id ?? '',
    type: row.type,
    amount: Number(row.amount) || 0,
    currency: row.currency,
    status: row.status,
    description: row.description ?? '',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    user: {
      name: row.profiles?.name ?? 'Unknown',
      email: row.profiles?.email ?? '—',
    },
    rechargeDetails: rechargeOrder ? {
      productName: rechargeOrder.product_name ?? '—',
      skuCode: rechargeOrder.sku_code ?? '—',
      provider: rechargeOrder.provider ?? '—',
      operatorName: rechargeOrder.operator_name ?? '—',
      status: rechargeOrder.status ?? '—',
      phoneNumber: rechargeOrder.phone_number ?? '—',
    } : null,
  }
}

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'transactions', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const status = (url.searchParams.get('status') ?? '').trim()
  const limit = Math.min((Number(url.searchParams.get('limit') ?? '100')) || 100, 500)
  const statusFilter = status && status !== 'all' ? `status=eq.${encodeURIComponent(status)}&` : ''

  const res = await supabaseRest(
    `transactions?${statusFilter}type=neq.refund&select=id,user_id,type,amount,currency,status,description,metadata,created_at,profiles(name,email),recharge_orders(product_name,sku_code,provider,operator_name,status,phone_number)&order=created_at.desc&limit=${limit}`,
    { cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })
  const transactionRows = (await res.json()) as TransactionRow[]

  // Fetch routing logs for these transactions to find the initiated provider (DTONE, DING, VALUETOPUP)
  const txIds = transactionRows.map((t) => t.id)
  const providerMap = new Map<string, string>()
  if (txIds.length > 0) {
    try {
      const logsRes = await supabaseRest(
        `routing_logs?transaction_id=in.(${txIds.map(encodeURIComponent).join(',')})&select=transaction_id,provider_id,provider_cost,status,created_at,lcr_providers(code,name)&order=created_at.asc`,
        { cache: 'no-store' }
      )
      if (logsRes.ok) {
        const rawLogs = (await logsRes.json()) as Array<{
          transaction_id: string
          provider_id: string | null
          provider_cost: string | number | null
          status: string
          created_at: string
          lcr_providers: { code: string; name: string } | null
        }>

        // Helper to parse status JSON
        const parseStatus = (statusStr: string) => {
          try {
            if (statusStr && statusStr.startsWith('{')) {
              return JSON.parse(statusStr)
            }
          } catch (e) {}
          return null
        }

        // Group logs by transaction_id
        const groups: Record<string, typeof rawLogs> = {}
        for (const log of rawLogs) {
          if (log.transaction_id) {
            if (!groups[log.transaction_id]) {
              groups[log.transaction_id] = []
            }
            groups[log.transaction_id].push(log)
          }
        }

        // Resolve provider code for each transaction group
        for (const [txId, txLogs] of Object.entries(groups)) {
          const sortedTxLogs = [...txLogs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          
          let resolvedProviderCode = sortedTxLogs[sortedTxLogs.length - 1]?.lcr_providers?.code

          for (const log of sortedTxLogs) {
            const parsed = parseStatus(log.status)
            const providerCost = log.provider_cost != null ? Number(log.provider_cost) : null
            const code = log.lcr_providers?.code

            if (parsed) {
              if (providerCost != null) {
                if (code) resolvedProviderCode = code
              } else if (code && !resolvedProviderCode) {
                resolvedProviderCode = code
              }
            } else {
              if (code) resolvedProviderCode = code
            }
          }

          if (resolvedProviderCode) {
            providerMap.set(txId, resolvedProviderCode)
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch routing logs:', e)
    }
  }

  const transactions = transactionRows.map((row) => {
    const mapped = mapTransaction(row)
    const logProvider = providerMap.get(row.id)
    if (logProvider) {
      if (!mapped.rechargeDetails) {
        mapped.rechargeDetails = {
          productName: '—',
          skuCode: '—',
          provider: logProvider,
          operatorName: '—',
          status: '—',
          phoneNumber: '—',
        }
      } else if (!mapped.rechargeDetails.provider || mapped.rechargeDetails.provider === '—' || mapped.rechargeDetails.provider === 'null') {
        mapped.rechargeDetails.provider = logProvider
      }
    }
    return mapped
  })

  return NextResponse.json({ transactions })
}
