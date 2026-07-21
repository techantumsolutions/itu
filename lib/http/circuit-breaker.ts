/**
 * Per-key circuit breaker for outbound provider calls.
 * Shared across replicas only when state is stored in Redis; process-local is still
 * valuable to stop cascade storms on a single worker.
 */

export type CircuitState = 'closed' | 'open' | 'half_open'

export type CircuitBreakerOptions = {
  failureThreshold?: number
  successThreshold?: number
  /** How long the circuit stays open before a probe is allowed */
  openMs?: number
}

type BreakerEntry = {
  failures: number
  successes: number
  state: CircuitState
  openedAt: number
}

const DEFAULTS = {
  failureThreshold: 5,
  successThreshold: 2,
  openMs: 30_000,
}

const breakers = new Map<string, BreakerEntry>()

function entry(key: string): BreakerEntry {
  let e = breakers.get(key)
  if (!e) {
    e = { failures: 0, successes: 0, state: 'closed', openedAt: 0 }
    breakers.set(key, e)
  }
  return e
}

export function getCircuitState(key: string): CircuitState {
  const e = entry(key)
  if (e.state === 'open') {
    const openMs = DEFAULTS.openMs
    if (Date.now() - e.openedAt >= openMs) {
      e.state = 'half_open'
      e.successes = 0
    }
  }
  return e.state
}

export function assertCircuitAllows(key: string): void {
  const state = getCircuitState(key)
  if (state === 'open') {
    throw new Error(`circuit_open:${key}`)
  }
}

export function recordCircuitSuccess(key: string, opts?: CircuitBreakerOptions): void {
  const e = entry(key)
  const successThreshold = opts?.successThreshold ?? DEFAULTS.successThreshold
  if (e.state === 'half_open') {
    e.successes += 1
    if (e.successes >= successThreshold) {
      e.state = 'closed'
      e.failures = 0
      e.successes = 0
    }
    return
  }
  e.failures = 0
  e.state = 'closed'
}

export function recordCircuitFailure(key: string, opts?: CircuitBreakerOptions): void {
  const e = entry(key)
  const failureThreshold = opts?.failureThreshold ?? DEFAULTS.failureThreshold
  const openMs = opts?.openMs ?? DEFAULTS.openMs
  if (e.state === 'half_open') {
    e.state = 'open'
    e.openedAt = Date.now()
    e.failures = failureThreshold
    e.successes = 0
    return
  }
  e.failures += 1
  if (e.failures >= failureThreshold) {
    e.state = 'open'
    e.openedAt = Date.now()
    void openMs
  }
}

/** @internal */
export function resetCircuitBreakersForTests(): void {
  breakers.clear()
}
