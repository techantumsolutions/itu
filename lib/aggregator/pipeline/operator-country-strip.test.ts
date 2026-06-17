import {
  buildCountryStripTokens,
  operatorMergeKey,
  operatorNameForFiltration,
  stripOperatorCountryAffixes,
} from './operator-country-strip'

describe('operator-country-strip', () => {
  it('strips country ISO3 suffix', () => {
    expect(stripOperatorCountryAffixes('Airtel IND', 'IND')).toBe('Airtel')
  })

  it('strips country ISO3 prefix', () => {
    expect(stripOperatorCountryAffixes('IND Airtel', 'IND')).toBe('Airtel')
  })

  it('strips country name suffix', () => {
    expect(stripOperatorCountryAffixes('Airtel India', 'IND')).toBe('Airtel')
  })

  it('strips ISO2 prefix and suffix', () => {
    expect(stripOperatorCountryAffixes('IN Vi', 'IND')).toBe('Vi')
    expect(stripOperatorCountryAffixes('Vi IN', 'IND')).toBe('Vi')
  })

  it('leaves operator name unchanged when no country affix', () => {
    expect(stripOperatorCountryAffixes('Jio', 'IND')).toBe('Jio')
  })

  it('builds merge keys for equivalent names after stripping', () => {
    const keyA = operatorMergeKey('Airtel India', 'IND')
    const keyB = operatorMergeKey('IND Airtel', 'IND')
    expect(keyA).toBe(keyB)
    expect(keyA).toBe('AIRTEL')
  })

  it('includes country tokens for affix stripping', () => {
    const tokens = buildCountryStripTokens('IND')
    expect(tokens).toEqual(expect.arrayContaining(['IND', 'IN', 'INDIA']))
  })
})
