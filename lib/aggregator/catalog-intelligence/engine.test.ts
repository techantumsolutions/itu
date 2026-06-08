import { CatalogIntelligenceEngine } from './engine'
import { enrichPlanFromRaw } from './enrichment'
import { matchTrustedOperator } from './trust-registry'

describe('CatalogIntelligenceEngine', () => {
  const engine = new CatalogIntelligenceEngine()

  it('promotes trusted operators like Jio/Joi even without benefits', () => {
    for (const name of ['Jio', 'Joi', 'Reliance Jio']) {
      const result = engine.evaluateOperatorPromotion({
        operatorName: name,
        countryCode: 'IND',
        rawPlans: [{ product_name: '299 recharge', description: '', benefits: [] }],
      })
      expect(result.shouldPromote).toBe(true)
      expect(result.trustedOperator).toBe(true)
      expect(result.shouldDeactivate).toBe(false)
    }
  })

  it('infers telecom metadata from weak titles without benefits', () => {
    const enrichment = enrichPlanFromRaw({
      product_name: '299 Combo 1.5GB/day 28 days',
      description: '',
      benefits: [],
    })
    expect(enrichment.inferredServiceType).toBe('telecom')
    expect(enrichment.inferredDataMb).toBe(1536)
    expect(enrichment.inferredValidity).toBe('28 days')
    expect(enrichment.matchedKeywords).toEqual(expect.arrayContaining(['data_volume', 'validity_days', 'combo']))

    const classified = engine.classifyRawPlan({
      raw: { product_name: '299 Combo 1.5GB/day 28 days', benefits: [] },
      operatorName: 'Jio',
      countryCode: 'IND',
    })
    expect(classified.shouldPromote).toBe(true)
    expect(['HIGH_CONFIDENCE_TELECOM', 'MEDIUM_CONFIDENCE_TELECOM', 'LOW_CONFIDENCE_TELECOM']).toContain(classified.confidenceLevel)
    expect(classified.catalogStatus).toBe('ACTIVE')
  })

  it('does not penalize missing descriptions or benefits for trusted operators', () => {
    const classified = engine.classifyRawPlan({
      raw: { product_name: '199', amount: 199, currency: 'INR', benefits: [] },
      operatorName: 'Airtel',
      countryCode: 'IND',
    })
    expect(classified.reasons).toContain('missing_benefits_not_penalized')
    expect(classified.shouldPromote).toBe(true)
  })

  it('quarantines confirmed non-telecom products', () => {
    const classified = engine.classifyRawPlan({
      raw: {
        product_name: 'Crunchyroll Fan 1 Month',
        description: 'Streaming subscription membership',
        type: 'DigitalProduct',
        benefits: [],
      },
      operatorName: 'Unknown Retailer',
    })
    expect(['CONFIRMED_NON_TELECOM', 'SUSPICIOUS_NON_TELECOM']).toContain(classified.confidenceLevel)
    expect(['QUARANTINED', 'NON_TELECOM', 'REVIEW']).toContain(classified.catalogStatus)
    expect(classified.shouldQuarantine).toBe(true)
    expect(classified.shouldPromote).toBe(false)
  })

  it('matches Joi as trusted telecom alias for Jio typo', () => {
    expect(matchTrustedOperator('Joi Prepaid', 'IND')?.displayName).toBe('Joi')
    expect(matchTrustedOperator('JOI', 'IND')?.isVerifiedTelecom).toBe(true)
  })

  it('soft-promotes mixed catalogs with at least one telecom plan', () => {
    const result = engine.evaluateOperatorPromotion({
      operatorName: 'Mixed Catalog Operator',
      rawPlans: [
        { product_name: '10GB Data Pack', benefits: [{ type: 'DATA' }] },
        { product_name: 'Netflix 1 Month', description: 'streaming subscription' },
        { product_name: 'Amazon Gift Card' },
      ],
    })
    expect(result.shouldPromote).toBe(true)
    expect(result.telecomPlanCount).toBeGreaterThanOrEqual(1)
    expect(result.shouldDeactivate).toBe(false)
  })
})
