import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'dashboard', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [summaryRes, salesRes, productsRes] = await Promise.all([
    supabaseRest('admin_dashboard_summary?select=*', { cache: 'no-store' }),
    supabaseRest('admin_daily_sales?select=day,currency,revenue,orders&order=day.desc&limit=30', { cache: 'no-store' }),
    supabaseRest('admin_top_products?select=product_name,operator_name,orders,revenue,currency&limit=10', { cache: 'no-store' }),
  ])

  if (!summaryRes.ok || !salesRes.ok || !productsRes.ok) {
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }

  const summaryRows = (await summaryRes.json()) as Array<Record<string, unknown>>
  const sales = (await salesRes.json()) as Array<Record<string, unknown>>
  const topProducts = (await productsRes.json()) as Array<Record<string, unknown>>

  return NextResponse.json({
    summary:
      summaryRows[0] ?? {
        total_revenue: 0,
        total_orders: 0,
        completed_orders: 0,
        failed_orders: 0,
      },
    sales,
    topProducts,
  })
}
