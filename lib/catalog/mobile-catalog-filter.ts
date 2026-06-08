import { isGenuineTelecomOperatorName } from '@/lib/aggregator/operator-classifier'
import { isMobileTelecomDomain, matchNonTelecomOperator } from '@/lib/aggregator/catalog-intelligence'

export function isMobileCatalogOperator(row: {
  system_operator_name?: string | null
  operator_domain?: string | null
  service_domain?: string | null
  country_id?: string | null
}): boolean {
  const serviceDomain = String(row.service_domain ?? row.operator_domain ?? '').toUpperCase()
  if (serviceDomain) return isMobileTelecomDomain(serviceDomain)

  const name = String(row.system_operator_name ?? '')
  if (matchNonTelecomOperator(name)) return false
  return isGenuineTelecomOperatorName(name, row.country_id ?? undefined)
}
