import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'dashboard'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [summaryRes, salesRes, productsRes, usersRes] = await Promise.all([
    supabaseRest('admin_dashboard_summary?select=*', { cache: 'no-store' }),
    supabaseRest('admin_daily_sales?select=day,currency,revenue,orders&order=day.desc&limit=30', { cache: 'no-store' }),
    supabaseRest('admin_top_products?select=product_name,operator_name,orders,revenue,currency&limit=10', { cache: 'no-store' }),
    supabaseRest('profiles?app_role=eq.user&select=id&limit=1', { 
      headers: { Prefer: 'count=exact' },
      cache: 'no-store'
    }),
  ])

  if (!summaryRes.ok || !salesRes.ok || !productsRes.ok) {
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 })
  }

  const summaryRows = (await summaryRes.json()) as Array<Record<string, unknown>>
  const sales = (await salesRes.json()) as Array<Record<string, unknown>>
  const topProducts = (await productsRes.json()) as Array<Record<string, unknown>>

  let total_users = 0
  if (usersRes.ok) {
    const range = usersRes.headers.get('Content-Range')
    if (range) {
      const parts = range.split('/')
      if (parts.length === 2) {
        total_users = parseInt(parts[1], 10) || 0
      }
    }
  }

  return NextResponse.json({
    summary: {
      ...(summaryRows[0] ?? {
        total_revenue: 0,
        total_orders: 0,
        completed_orders: 0,
        failed_orders: 0,
      }),
      total_users,
    },
    sales,
    topProducts,
  })
}
