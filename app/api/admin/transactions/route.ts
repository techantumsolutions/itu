import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { loadAdminTransactions } from '@/lib/admin/admin-transactions'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'transactions'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const page = Number(url.searchParams.get('page') ?? '1')
  const pageSize = Number(url.searchParams.get('pageSize') ?? url.searchParams.get('limit') ?? '25')
  const status = (url.searchParams.get('status') ?? 'all').trim()
  const date = (url.searchParams.get('date') ?? 'all').trim()
  const search = (url.searchParams.get('search') ?? '').trim()

  try {
    const result = await loadAdminTransactions({ page, pageSize, status, date, search })
    return NextResponse.json({
      transactions: result.transactions,
      pagination: result.pagination,
      summary: result.summary,
      reportingCurrency: result.summary.reporting_currency,
    })
  } catch (error) {
    console.error('Failed to load admin transactions:', error)
    return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })
  }
}
