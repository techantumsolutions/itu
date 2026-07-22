/**
 * @jest-environment node
 */
import { safeJsonStringify, logger, installConsoleBridge } from '@/lib/observability/logger'

describe('safeJsonStringify', () => {
  it('handles circular references', () => {
    const a: Record<string, unknown> = { ok: true }
    a.self = a
    const out = safeJsonStringify(a)
    expect(out).toContain('[Circular]')
    expect(out).toContain('"ok":true')
  })

  it('truncates huge strings', () => {
    const huge = 'x'.repeat(50_000)
    const out = safeJsonStringify({ huge })
    expect(out.length).toBeLessThan(40_000)
    expect(out).toContain('truncated')
  })

  it('serializes Error without throwing', () => {
    const err = new Error('boom')
    const out = safeJsonStringify({ err })
    expect(out).toContain('boom')
    expect(out).toContain('Error')
  })
})

describe('console bridge recursion', () => {
  const prevNodeEnv = process.env.NODE_ENV
  const prevLogFormat = process.env.LOG_FORMAT
  const origLog = console.log
  const origInfo = console.info
  const origWarn = console.warn
  const origError = console.error
  const origDebug = console.debug

  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv
    process.env.LOG_FORMAT = prevLogFormat
    delete (globalThis as { __ituConsoleBridge?: boolean }).__ituConsoleBridge
    console.log = origLog
    console.info = origInfo
    console.warn = origWarn
    console.error = origError
    console.debug = origDebug
  })

  it('does not nest JSON until RangeError when bridge is installed', () => {
    process.env.NODE_ENV = 'production'
    process.env.LOG_FORMAT = 'json'
    delete (globalThis as { __ituConsoleBridge?: boolean }).__ituConsoleBridge

    installConsoleBridge()

    // Would previously recurse: logger → console.log → logger → …
    expect(() => {
      for (let i = 0; i < 20; i++) logger.info('bridge_recursion_probe', { i })
      console.log('bridged_call', { nested: true })
    }).not.toThrow()
  })
})
