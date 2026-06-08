import { CatalogIntelligenceEngine } from './engine'
import { exactMobileBrandMatch, detectExplicitServiceDomain } from './brand-intelligence'
import { matchTrustedOperator } from './trust-registry'

describe('brand-intelligence strict matching', () => {
  it('does not fuzzy-match Airtel DTH to Airtel mobile trust', () => {
    expect(matchTrustedOperator('Airtel DTH IND')).toBeNull()
    expect(detectExplicitServiceDomain('Airtel DTH IND')?.domain).toBe('DTH')
  })

  it('exact-matches Airtel IND to mobile trust', () => {
    expect(matchTrustedOperator('Airtel IND')?.displayName).toBe('Airtel')
    expect(exactMobileBrandMatch('AIRTEL IND', 'AIRTEL')).toBe(true)
    expect(exactMobileBrandMatch('AIRTEL DTH IND', 'AIRTEL')).toBe(false)
  })

  it('classifies Hyatt Hotel as TRAVEL not MOBILE', () => {
    const engine = new CatalogIntelligenceEngine()
    const result = engine.evaluateOperatorDomain({ operatorName: 'Hyatt Hotel IND', rawPlans: [] })
    expect(result.domain).toBe('TRAVEL')
    expect(result.classificationSource).toBe('explicit_domain_override')
    expect(result.isBlockedFromTelecom).toBe(true)
  })

  it('classifies Airtel DTH as DTH with explicit override before trust', () => {
    const engine = new CatalogIntelligenceEngine()
    const result = engine.evaluateOperatorDomain({
      operatorName: 'Airtel DTH IND',
      rawPlans: [{ product_name: 'Airtel DTH Monthly Pack', benefits: [{ type: 'DATA' }] }],
    })
    expect(result.domain).toBe('DTH')
    expect(result.classificationSource).not.toBe('trusted_telecom_registry')
  })

  it('keeps Airtel IND as MOBILE via exact trusted brand', () => {
    const engine = new CatalogIntelligenceEngine()
    const result = engine.evaluateOperatorDomain({
      operatorName: 'Airtel IND',
      rawPlans: [],
    })
    expect(result.domain).toBe('MOBILE')
    expect(result.classificationSource).toBe('trusted_telecom_registry')
  })
})
