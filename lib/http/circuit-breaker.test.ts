import {
  assertCircuitAllows,
  getCircuitState,
  recordCircuitFailure,
  recordCircuitSuccess,
  resetCircuitBreakersForTests,
} from '@/lib/http/circuit-breaker'

describe('circuit-breaker', () => {
  beforeEach(() => {
    resetCircuitBreakersForTests()
  })

  it('opens after failure threshold', () => {
    const key = 'provider:test:host'
    for (let i = 0; i < 5; i++) recordCircuitFailure(key)
    expect(getCircuitState(key)).toBe('open')
    expect(() => assertCircuitAllows(key)).toThrow(/circuit_open/)
  })

  it('closes after successes in half-open', () => {
    const key = 'provider:test:host2'
    for (let i = 0; i < 5; i++) recordCircuitFailure(key, { openMs: 0 })
    // force half-open via openMs 0
    expect(['open', 'half_open']).toContain(getCircuitState(key))
    recordCircuitSuccess(key)
    recordCircuitSuccess(key)
    expect(getCircuitState(key)).toBe('closed')
  })
})
