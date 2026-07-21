/**
 * @jest-environment node
 */
import {
  assertProductionRedisAuth,
  injectRedisPassword,
  redisUrlHasPassword,
  resolveRedisUrl,
  validateProductionRedisAuth,
} from '@/lib/cache/redis-connection'

jest.mock('@/lib/env/runtime', () => ({
  runtimeEnv: jest.fn((key: string) => process.env[key]?.trim() || undefined),
}))

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  })
}

describe('redis-connection', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.REDIS_URL
    delete process.env.REDIS_PASSWORD
    setNodeEnv('test')
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('detects password in redis URL', () => {
    expect(redisUrlHasPassword('redis://redis:6379')).toBe(false)
    expect(redisUrlHasPassword('redis://:s3cret@redis:6379')).toBe(true)
  })

  it('injects password into URL without auth', () => {
    const url = injectRedisPassword('redis://redis:6379', 's3cret')
    expect(redisUrlHasPassword(url)).toBe(true)
    expect(url).toContain('s3cret')
  })

  it('resolveRedisUrl injects REDIS_PASSWORD when URL has none', () => {
    process.env.REDIS_URL = 'redis://redis:6379'
    process.env.REDIS_PASSWORD = 'prod-pass'
    const url = resolveRedisUrl()
    expect(url).toBeTruthy()
    expect(redisUrlHasPassword(url!)).toBe(true)
  })

  it('production rejects unauthenticated Redis', () => {
    setNodeEnv('production')
    process.env.REDIS_URL = 'redis://redis:6379'
    expect(() => assertProductionRedisAuth()).toThrow(/requires AUTH/i)
    expect(validateProductionRedisAuth().ok).toBe(false)
  })

  it('production accepts REDIS_PASSWORD', () => {
    setNodeEnv('production')
    process.env.REDIS_URL = 'redis://redis:6379'
    process.env.REDIS_PASSWORD = 'prod-pass'
    expect(() => assertProductionRedisAuth()).not.toThrow()
    expect(validateProductionRedisAuth()).toEqual({ ok: true })
  })
})
