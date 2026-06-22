import { isMobileCatalogOperator, isMobileCatalogPlan } from '@/lib/catalog/mobile-catalog-filter'

describe('mobile-catalog-filter', () => {
  it('allows only ACTIVE operators with service_domain MOBILE', () => {
    expect(isMobileCatalogOperator({ status: 'ACTIVE', service_domain: 'MOBILE' })).toBe(true)
    expect(isMobileCatalogOperator({ status: 'ACTIVE', service_domain: 'DTH' })).toBe(false)
    expect(isMobileCatalogOperator({ status: 'ACTIVE', service_domain: 'TRAVEL' })).toBe(false)
    expect(isMobileCatalogOperator({ status: 'INACTIVE', service_domain: 'MOBILE' })).toBe(false)
    expect(isMobileCatalogOperator({ status: 'ACTIVE', service_domain: null })).toBe(false)
    expect(isMobileCatalogOperator({ service_domain: 'MOBILE' })).toBe(true)
  })

  it('allows only ACTIVE plans with service_domain MOBILE', () => {
    expect(isMobileCatalogPlan({ status: 'ACTIVE', service_domain: 'MOBILE' })).toBe(true)
    expect(isMobileCatalogPlan({ status: 'ACTIVE', service_domain: null })).toBe(true)
    expect(isMobileCatalogPlan({ status: 'ACTIVE', service_domain: 'OTT' })).toBe(false)
    expect(isMobileCatalogPlan({ status: 'INACTIVE', service_domain: 'MOBILE' })).toBe(false)
  })
})
