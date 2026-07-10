import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { runReport } from '@/lib/reports/engine'
import type { ReportQueryParams, ReportFilters, ReportType, ReportSort } from '@/lib/reports/types'
import { getDefaultDateRange, resolveDateRange } from '@/lib/reports/date-range'

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'reports'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const reportType = url.searchParams.get('reportType') as ReportType | null
  if (!reportType) {
    return NextResponse.json({ error: 'reportType is required' }, { status: 400 })
  }

  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const preset = url.searchParams.get('preset')

  const dateRange = preset
    ? resolveDateRange(preset as any, from ?? undefined, to ?? undefined)
    : (from && to ? { from, to } : getDefaultDateRange())

  const filters: ReportFilters = {
    dateRange,
  }

  // Gather dynamic filters
  url.searchParams.forEach((val, key) => {
    if (['reportType', 'page', 'pageSize', 'sort', 'search', 'groupBy', 'from', 'to', 'preset'].includes(key)) return
    filters[key] = val
  })

  if (url.searchParams.has('search')) {
    filters.search = url.searchParams.get('search') || undefined
  }
  if (url.searchParams.has('groupBy')) {
    filters.groupBy = url.searchParams.get('groupBy') || undefined
  }

  let sort: ReportSort | undefined = undefined
  const sortParam = url.searchParams.get('sort')
  if (sortParam && sortParam.includes(':')) {
    const [column, direction] = sortParam.split(':')
    sort = { column, direction: direction === 'asc' ? 'asc' : 'desc' }
  }

  const params: ReportQueryParams = {
    reportType,
    filters,
    page:     Math.max(1, parseInt(url.searchParams.get('page') || '1', 10)),
    pageSize: Math.min(500, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10))),
    sort,
  }

  const result = await runReport(params)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(result.data)
}

export async function POST(request: Request) {
  if (!(await adminCanUseFeature(request, 'reports'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Partial<ReportQueryParams>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const reportType = body.reportType as ReportType | undefined
  if (!reportType) {
    return NextResponse.json({ error: 'reportType is required' }, { status: 400 })
  }

  const filters: ReportFilters = {
    ...(body.filters ?? {}),
    dateRange: body.filters?.dateRange ?? getDefaultDateRange(),
  }

  if (filters.dateRange?.preset && (!filters.dateRange.from || !filters.dateRange.to)) {
    filters.dateRange = resolveDateRange(
      filters.dateRange.preset,
      filters.dateRange.from,
      filters.dateRange.to
    )
  }

  const params: ReportQueryParams = {
    reportType,
    filters,
    page:     Math.max(1, body.page ?? 1),
    pageSize: Math.min(500, Math.max(1, body.pageSize ?? 50)),
    sort:     body.sort,
  }

  const result = await runReport(params)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(result.data)
}
