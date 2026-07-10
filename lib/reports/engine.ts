import type { ReportQueryParams, ReportApiResponse, ReportData } from './types'
import { getReportConfig } from './report-configs'
import { executeReport } from './runner'

interface CacheEntry {
  data: ReportData
  expiresAt: number
}

const cacheStore = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60 * 1000 // 1 minute Cache TTL

function getCacheKey(params: ReportQueryParams): string {
  const filtersCopy = { ...params.filters }
  delete filtersCopy.refresh
  return JSON.stringify({
    reportType: params.reportType,
    filters: filtersCopy,
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
  })
}

export async function runReport(params: ReportQueryParams): Promise<ReportApiResponse> {
  const config = getReportConfig(params.reportType)

  if (!config) {
    return { success: false, error: `Unknown report type: "${params.reportType}"` }
  }

  const forceRefresh = params.filters?.refresh === 'true' || params.filters?.refresh === true
  const cacheKey = getCacheKey(params)

  if (!forceRefresh) {
    const cached = cacheStore.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return { success: true, data: cached.data }
    }
  }

  try {
    const data = await executeReport(
      config,
      params.filters,
      params.sort,
      params.page,
      params.pageSize,
    )

    cacheStore.set(cacheKey, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })

    return { success: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Report engine error'
    console.error(`[ReportEngine:${params.reportType}]`, err)
    return { success: false, error: message }
  }
}
