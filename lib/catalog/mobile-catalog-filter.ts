import { isMobileTelecomDomain } from '@/lib/aggregator/catalog-intelligence'

export function isMobileCatalogOperator(row: {
  status?: string | null
  service_domain?: string | null
}): boolean {
  if (String(row.status ?? 'ACTIVE').toUpperCase() !== 'ACTIVE') return false
  return isMobileTelecomDomain(row.service_domain)
}

export function isMobileCatalogPlan(row: {
  status?: string | null
  service_domain?: string | null
}): boolean {
  if (String(row.status ?? 'ACTIVE').toUpperCase() !== 'ACTIVE') return false
  const domain = String(row.service_domain ?? '').trim().toUpperCase()
  // Match aggListSystemPlans mobileCatalogOnly: MOBILE or legacy null/unknown rows.
  if (!domain || domain === 'UNKNOWN') return true
  return isMobileTelecomDomain(domain)
}
