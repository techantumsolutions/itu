import type { OperatorMergeHistoryRow } from './types'
import { OperatorMergeHistoryMatcher } from './matcher'

function row(
  input: Partial<OperatorMergeHistoryRow> &
    Pick<OperatorMergeHistoryRow, 'countryIso3' | 'sourceOperatorName' | 'targetOperatorName'>,
): OperatorMergeHistoryRow {
  return {
    id: input.id ?? 'test-id',
    countryIso3: input.countryIso3,
    sourceOperatorName: input.sourceOperatorName,
    sourceOperatorNormalized: input.sourceOperatorNormalized ?? input.sourceOperatorName.toUpperCase(),
    targetOperatorName: input.targetOperatorName,
    targetOperatorNormalized: input.targetOperatorNormalized ?? input.targetOperatorName.toUpperCase(),
    mergeReason: input.mergeReason ?? 'ADMIN_MERGE',
    mergedByAdmin: input.mergedByAdmin ?? 'admin@test.com',
    isActive: input.isActive ?? true,
  }
}

describe('OperatorMergeHistoryMatcher', () => {
  const matcher = new OperatorMergeHistoryMatcher([
    row({
      countryIso3: 'IND',
      sourceOperatorName: 'Vodafone India',
      sourceOperatorNormalized: 'VODAFONE',
      targetOperatorName: 'Vi',
      targetOperatorNormalized: 'VI',
    }),
    row({
      countryIso3: 'IND',
      sourceOperatorName: 'Bharti Airtel',
      sourceOperatorNormalized: 'BHARTI AIRTEL',
      targetOperatorName: 'Airtel',
      targetOperatorNormalized: 'AIRTEL',
    }),
  ])

  it('matches exact source names within country', () => {
    const match = matcher.match('Vodafone India', 'IND')
    expect(match?.matchMethod).toBe('exact')
    expect(match?.row.targetOperatorName).toBe('Vi')
  })

  it('matches normalized source names', () => {
    const match = matcher.match('bharti airtel', 'IND')
    expect(match?.matchMethod).toBe('exact')
    expect(match?.row.targetOperatorName).toBe('Airtel')
  })

  it('does not match across countries', () => {
    expect(matcher.match('Vodafone India', 'USA')).toBeNull()
  })
})
