import { resolveRequestId, REQUEST_ID_HEADER } from '@/lib/observability/request-id'

describe('observability request-id', () => {
  it('exports the standard header name', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id')
  })

  it('preserves a valid inbound id', () => {
    expect(resolveRequestId('abc-123')).toBe('abc-123')
  })

  it('generates when missing', () => {
    const id = resolveRequestId(null)
    expect(id.length).toBeGreaterThan(10)
  })
})
