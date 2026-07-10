/**
 * Report Registry — derived from ALL_REPORT_CONFIGS.
 *
 * The UI sidebar, viewer, and filter bar consume ReportDefinition objects.
 * This file converts ReportConfig → ReportDefinition so the frontend
 * components need zero changes.
 *
 * Adding a new report = add to report-configs.ts. This file auto-updates.
 */

import { ALL_REPORT_CONFIGS } from './report-configs'
import { toReportDefinition } from './config'
import type { ReportDefinition, ReportCategory } from './types'

// Build the registry map at module load time
const REPORT_REGISTRY_MAP = new Map<string, ReportDefinition>(
  ALL_REPORT_CONFIGS.map((cfg) => [cfg.id, toReportDefinition(cfg)])
)

export const REPORT_REGISTRY: Readonly<Record<string, ReportDefinition>> =
  Object.fromEntries(REPORT_REGISTRY_MAP.entries())

export function getReportDefinition(id: string): ReportDefinition | undefined {
  return REPORT_REGISTRY_MAP.get(id)
}

export function getAllReportDefinitions(): ReportDefinition[] {
  return Array.from(REPORT_REGISTRY_MAP.values())
}

export function getReportsByCategory(category: ReportCategory): ReportDefinition[] {
  return getAllReportDefinitions().filter((r) => r.category === category)
}
