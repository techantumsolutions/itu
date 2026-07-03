import { describe, expect, it } from '@jest/globals'
import { formatCompactNumber } from '@/lib/format/compact-number'

describe('formatCompactNumber', () => {
  it('formats values under 1K without suffix', () => {
    expect(formatCompactNumber(358)).toBe('358')
    expect(formatCompactNumber(999)).toBe('999')
  })

  it('formats thousands with one decimal under 100K', () => {
    expect(formatCompactNumber(5889)).toBe('5.9K')
    expect(formatCompactNumber(12450)).toBe('12.5K')
  })

  it('formats 100K+ without decimal', () => {
    expect(formatCompactNumber(102345)).toBe('102K')
  })
})
