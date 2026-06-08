import { CatalogIntelligenceEngine } from './engine'
import { resolvePlanServiceDomain, segmentOperatorPlansAtIngestion } from './segmentation'

describe('Service domain segmentation', () => {
  const engine = new CatalogIntelligenceEngine()

  it('blocks Netflix recharge plans via operator domain override', () => {
    const operatorEval = engine.evaluateOperatorDomain({
      operatorName: 'Netflix',
      rawPlans: [{ product_name: 'Netflix Recharge 1 Month Premium', description: 'recharge subscription' }],
    })
    const segment = resolvePlanServiceDomain({
      operatorEvaluation: operatorEval,
      planEvaluation: {
        domain: 'MOBILE',
        confidence: 70,
        matchedKeywords: ['telecom'],
        reasons: ['text_pattern:MOBILE'],
      },
    })
    expect(segment.serviceDomain).toBe('OTT')
    expect(segment.entersMobileTelecomPipeline).toBe(false)
  })

  it('routes Jio data plans into the mobile telecom pipeline', () => {
    const result = segmentOperatorPlansAtIngestion(engine, {
      operatorName: 'Jio',
      countryCode: 'IND',
      plans: [
        { raw: { product_name: '299 Combo 1.5GB/day 28 days', benefits: [] } },
        { raw: { product_name: '10GB Data Pack', benefits: [{ type: 'DATA' }] } },
      ],
    })
    expect(result.operatorEvaluation.domain).toBe('MOBILE')
    expect(result.entersMobileTelecomPipeline).toBe(true)
    expect(result.mobilePlanCount).toBeGreaterThan(0)
  })

  it('segments giftcard operators out of mobile pipeline', () => {
    const result = segmentOperatorPlansAtIngestion(engine, {
      operatorName: 'Cafe Coffee Day',
      plans: [{ raw: { product_name: 'Cafe Coffee Day Recharge Voucher 500' } }],
    })
    expect(result.operatorEvaluation.domain).toBe('FOOD')
    expect(result.entersMobileTelecomPipeline).toBe(false)
  })
})
