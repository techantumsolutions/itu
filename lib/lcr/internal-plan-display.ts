export type InternalPlanRow = {
  id: string
  country_iso3: string
  operator_ref: string
  service?: string
  subservice?: string
  category: string
  uti_plan_name: string
  uti_description?: string | null
  active: boolean
  raw_response?: unknown
}

export function operatorNameFromInternalPlan(
  row: InternalPlanRow,
  systemOperatorNames?: Map<string, string>,
): string {
  const raw = row.raw_response
  if (raw && typeof raw === 'object' && raw !== null) {
    const operator = (raw as { operator?: { name?: string } }).operator
    if (operator?.name?.trim()) return operator.name.trim()
  }

  if (row.operator_ref.startsWith('system:')) {
    const id = row.operator_ref.slice('system:'.length)
    const fromSystem = systemOperatorNames?.get(id)
    if (fromSystem) return fromSystem
  }

  const planName = row.uti_plan_name?.trim()
  if (planName?.includes(' - ')) return planName.split(' - ')[0].trim()
  if (planName) return planName

  if (row.operator_ref.startsWith('dtone:')) return `Operator ${row.operator_ref.slice('dtone:'.length)}`
  return row.operator_ref || 'Unknown operator'
}

export function displayPlanName(row: InternalPlanRow): string {
  return row.uti_plan_name?.trim() || row.uti_description?.trim() || row.id
}

/** Prefer global catalog ordering over latest-ingest (avoids one-country-heavy views). */
export function internalPlansDefaultOrder(): string {
  return 'country_iso3.asc,uti_plan_name.asc'
}
