/**
 * Shared outbound HTTP for provider integrations.
 * - Keep-alive / connection reuse via undici Agent
 * - Hard timeouts via AbortSignal
 * - Optional circuit breaker key
 */

import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici'
import {
  assertCircuitAllows,
  recordCircuitFailure,
  recordCircuitSuccess,
  type CircuitBreakerOptions,
} from '@/lib/http/circuit-breaker'

const keepAliveAgent = new Agent({
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connections: 32,
  pipelining: 1,
})

export type OutboundFetchInit = Omit<RequestInit, 'signal'> & {
  signal?: AbortSignal | null
  timeoutMs?: number
  circuitKey?: string
  circuitOpts?: CircuitBreakerOptions
}

function mergeAbortSignals(
  timeoutMs: number | undefined,
  userSignal: AbortSignal | null | undefined,
): { signal: AbortSignal | undefined; cleanup: () => void } {
  if (!timeoutMs && !userSignal) return { signal: undefined, cleanup: () => {} }

  const controller = new AbortController()
  const onAbort = () => {
    if (!controller.signal.aborted) controller.abort(userSignal?.reason)
  }
  if (userSignal) {
    if (userSignal.aborted) onAbort()
    else userSignal.addEventListener('abort', onAbort, { once: true })
  }
  const timer =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => {
          controller.abort()
        }, timeoutMs)
      : null

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer)
      if (userSignal) userSignal.removeEventListener('abort', onAbort)
    },
  }
}

/**
 * Fetch with keep-alive agent, timeout, and optional circuit breaker.
 */
export async function outboundFetch(
  input: string | URL,
  init: OutboundFetchInit = {},
): Promise<Response> {
  const { timeoutMs = 30_000, circuitKey, circuitOpts, signal: userSignal, ...rest } = init
  if (circuitKey) assertCircuitAllows(circuitKey)

  const { signal, cleanup } = mergeAbortSignals(timeoutMs, userSignal ?? undefined)
  try {
    const url = typeof input === 'string' ? input : input.toString()
    const undiciInit: UndiciRequestInit = {
      method: rest.method,
      headers: rest.headers as UndiciRequestInit['headers'],
      body: rest.body as UndiciRequestInit['body'],
      signal: signal as UndiciRequestInit['signal'],
      dispatcher: keepAliveAgent,
    }
    const res = (await undiciFetch(url, undiciInit)) as unknown as Response

    if (circuitKey) {
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        recordCircuitSuccess(circuitKey, circuitOpts)
      } else if (res.status >= 500 || res.status === 429) {
        recordCircuitFailure(circuitKey, circuitOpts)
      }
    }
    return res
  } catch (err) {
    if (circuitKey) recordCircuitFailure(circuitKey, circuitOpts)
    throw err
  } finally {
    cleanup()
  }
}

export function providerCircuitKey(provider: string, host?: string): string {
  return `provider:${provider}:${host ?? 'default'}`
}
