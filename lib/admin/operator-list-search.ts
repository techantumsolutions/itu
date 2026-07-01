export type OperatorSearchFields = {
  operatorName?: string | null
  slug?: string | null
  operatorId?: string | null
  providerOperatorId?: string | null
  providerNames?: string[]
  providerCodes?: string[]
}

export function matchesOperatorListSearch(needle: string, fields: OperatorSearchFields): boolean {
  const q = needle.trim().toLowerCase()
  if (!q) return true

  const parts = [
    fields.operatorName,
    fields.slug,
    fields.operatorId,
    fields.providerOperatorId,
    ...(fields.providerNames ?? []),
    ...(fields.providerCodes ?? []),
  ]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)

  return parts.some((part) => part.includes(q))
}

export function matchesProviderListSearch(needle: string, providerNames: string[], providerCodes: string[]): boolean {
  const q = needle.trim().toLowerCase()
  if (!q) return true
  const parts = [...providerNames, ...providerCodes].map((v) => v.trim().toLowerCase()).filter(Boolean)
  return parts.some((part) => part.includes(q))
}

export type PlanSearchFields = {
  planName?: string | null
  operatorName?: string | null
  providerNames?: string[]
  providerCodes?: string[]
}

export function matchesPlanListSearch(needle: string, fields: PlanSearchFields): boolean {
  const q = needle.trim().toLowerCase()
  if (!q) return true

  const parts = [
    fields.planName,
    fields.operatorName,
    ...(fields.providerNames ?? []),
    ...(fields.providerCodes ?? []),
  ]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean)

  return parts.some((part) => part.includes(q))
}
