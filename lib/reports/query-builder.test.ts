import { describe, expect, it } from '@jest/globals'
import { buildQuery } from './query-builder'
import type { ReportConfig } from './config'
import type { ReportFilters, ReportSort } from './types'

describe('Report Query Builder', () => {
  const mockConfig: ReportConfig = {
    id: 'transactions',
    name: 'Transactions Test',
    description: 'Test Transactions Report',
    icon: 'FileSpreadsheet',
    category: 'operational',
    source: {
      table: 'transactions',
      select: 'id,created_at,status,amount,currency',
      staticFilters: ['type=eq.recharge'],
    },
    dateColumn: 'created_at',
    searchColumns: ['id', 'user_email'],
    filterMappings: [
      { filterKey: 'status', column: 'status', operator: 'eq' },
      { filterKey: 'provider', column: 'metadata', clientSide: true },
    ],
    columns: [],
    summaryCards: [],
    defaultSort: { column: 'created_at', direction: 'desc' },
    defaultDateRange: 'last_30_days',
  }

  it('builds standard data and count queries with static filters', () => {
    const filters: ReportFilters = {
      dateRange: { from: '2026-06-01', to: '2026-06-30' },
    }
    const sort: ReportSort = { column: 'amount', direction: 'asc' }

    const query = buildQuery(mockConfig, filters, sort, 1, 25)

    expect(query.isAggregated).toBe(false)
    expect(query.loadAll).toBe(false)
    expect(query.dataQuery).toContain('transactions?select=id%2Ccreated_at%2Cstatus%2Camount%2Ccurrency')
    expect(query.dataQuery).toContain('type=eq.recharge')
    expect(query.dataQuery).toContain('created_at=gte.2026-06-01T00:00:00Z')
    expect(query.dataQuery).toContain('created_at=lte.2026-06-30T23:59:59Z')
    expect(query.dataQuery).toContain('order=amount.asc')
    expect(query.dataQuery).toContain('limit=25')
    expect(query.dataQuery).toContain('offset=0')

    expect(query.countQuery).toContain('transactions?select=id')
    expect(query.countQuery).toContain('type=eq.recharge')
    expect(query.countQuery).toContain('created_at=gte.2026-06-01T00:00:00Z')
    expect(query.countQuery).not.toContain('order=')
    expect(query.countQuery).not.toContain('limit=')
  } )

  it('maps dynamic server-side filters and ignores client-side filters in query', () => {
    const filters: ReportFilters = {
      dateRange: { from: '2026-06-01', to: '2026-06-30' },
      status: 'completed',
      provider: 'dtone', // client-side filter
    }

    const query = buildQuery(mockConfig, filters, undefined, 1, 50)

    expect(query.dataQuery).toContain('status=eq.completed')
    expect(query.dataQuery).not.toContain('metadata=')
  })

  it('handles search queries by generating an OR clause across text search columns', () => {
    const filters: ReportFilters = {
      dateRange: { from: '2026-06-01', to: '2026-06-30' },
      search: 'user@example.com',
    }

    const query = buildQuery(mockConfig, filters, undefined, 1, 50)

    // UUID `id` is skipped (client-side search); text columns stay in the OR clause
    expect(query.dataQuery).toContain('or=(user_email.ilike.*user%40example.com*)')
    expect(query.dataQuery).not.toContain('id.ilike.')
  })

  it('skips server-side search for loadAll reports (client search after fetch)', () => {
    const loadAllConfig: ReportConfig = {
      ...mockConfig,
      source: { ...mockConfig.source, fetchLimit: 50000 },
    }
    const filters: ReportFilters = {
      dateRange: { from: '2026-06-01', to: '2026-06-30' },
      search: 'abc-123',
    }

    const query = buildQuery(loadAllConfig, filters, undefined, 1, 50)

    expect(query.loadAll).toBe(true)
    expect(query.dataQuery).not.toContain('or=(')
  })

  it('fetches complete set (using fetchLimit) without server pagination when aggregation is defined', () => {
    const aggConfig: ReportConfig = {
      ...mockConfig,
      aggregation: {
        groupByKey: 'status',
        aggregates: [{ key: 'count', fn: 'count' }],
      },
    }

    const filters: ReportFilters = {
      dateRange: { from: '2026-06-01', to: '2026-06-30' },
    }

    const query = buildQuery(aggConfig, filters, undefined, 1, 25)

    expect(query.isAggregated).toBe(true)
    expect(query.loadAll).toBe(true)
    expect(query.dataQuery).toContain('limit=50000') // fetchLimit default
    expect(query.dataQuery).not.toContain('offset=')
  })
})
