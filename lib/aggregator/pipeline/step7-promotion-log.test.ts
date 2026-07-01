import { describe, expect, it } from '@jest/globals'
import { validateSystemOperatorPromotionInput } from '@/lib/aggregator/pipeline/step7-promotion-log'

describe('step7-promotion-log', () => {
  it('accepts valid operator promotion input', () => {
    const result = validateSystemOperatorPromotionInput({
      systemOperatorName: 'Claro ARG',
      slug: 'claro-arg',
      countryId: 'ARG',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.name).toBe('Claro ARG')
      expect(result.countryId).toBe('ARG')
    }
  })

  it('rejects missing system_operator_name', () => {
    const result = validateSystemOperatorPromotionInput({
      systemOperatorName: '   ',
      slug: 'claro-arg',
      countryId: 'ARG',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toContain('system_operator_name')
    }
  })

  it('rejects missing slug and country', () => {
    const result = validateSystemOperatorPromotionInput({
      systemOperatorName: 'Claro ARG',
      slug: '',
      countryId: '',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.missing).toEqual(expect.arrayContaining(['slug', 'country_id']))
    }
  })
})
