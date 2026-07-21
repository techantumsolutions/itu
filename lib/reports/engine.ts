import type { ReportQueryParams, ReportApiResponse, ReportData } from './types'
import { getReportConfig } from './report-configs'
import { executeReport } from './runner'
import { cacheGetJson, cacheSetJson } from '@/lib/cache/redis'

const CACHE_TTL_SECONDS = 60
const CACHE_PREFIX = 'report:engine:'

function getCacheKey(params: ReportQueryParams): string {
  const filtersCopy = { ...params.filters }
  delete filtersCopy.refresh
  return (
    CACHE_PREFIX +
    JSON.stringify({
      reportType: params.reportType,
      filters: filtersCopy,
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
    })
  )
}

export async function runReport(params: ReportQueryParams): Promise<ReportApiResponse> {
  const config = getReportConfig(params.reportType)

  if (!config) {
    return { success: false, error: `Unknown report type: "${params.reportType}"` }
  }

  const forceRefresh = params.filters?.refresh === 'true' || params.filters?.refresh === true
  const cacheKey = getCacheKey(params)

  if (!forceRefresh) {
    const cached = await cacheGetJson<ReportData>(cacheKey)
    if (cached) {
      return { success: true, data: cached }
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

    await cacheSetJson(cacheKey, data, CACHE_TTL_SECONDS)

    return { success: true, data }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Report engine error'
    // Constant format string — reportType is request-controlled (js/tainted-format-string).
    console.error('[ReportEngine] %s', params.reportType, err)
    return { success: false, error: message }
  }
}
