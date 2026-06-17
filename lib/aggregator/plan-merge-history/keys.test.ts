import {
  buildOperatorMergeKey,
  buildPlanHistoryLookupKey,
  normalizePlanSignature,
} from './keys'

describe('plan-merge-history keys', () => {
  it('builds stable operator merge key', () => {
    expect(buildOperatorMergeKey('Airtel India')).toBe(buildOperatorMergeKey('airtel india'))
  })

  it('builds stable plan history lookup key', () => {
    const key = buildPlanHistoryLookupKey('IND', 'airtel', 'abc123signature')
    expect(key).toBe('IND:airtel:abc123signature')
  })

  it('normalizes plan signatures', () => {
    expect(normalizePlanSignature('  SIG  ')).toBe('SIG')
    expect(normalizePlanSignature(null)).toBe('')
  })
})
