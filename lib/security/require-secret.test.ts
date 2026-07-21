import { requireBearerSecret, requireHeaderSecret, blockInProduction } from '@/lib/security/require-secret'

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, 'NODE_ENV', {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  })
}

describe('requireBearerSecret', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'test' }
    delete process.env.CRON_SECRET
  })

  afterAll(() => {
    process.env = env
  })

  it('allows requests when secret is unset outside production', () => {
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer anything' },
    })
    expect(requireBearerSecret(request, 'CRON_SECRET')).toBeNull()
  })

  it('rejects requests in production when secret is unset', () => {
    setNodeEnv('production')
    const request = new Request('http://localhost/api/cron/test')
    const res = requireBearerSecret(request, 'CRON_SECRET')
    expect(res?.status).toBe(503)
  })

  it('rejects wrong bearer token when secret is configured', () => {
    process.env.CRON_SECRET = 'expected'
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer wrong' },
    })
    const res = requireBearerSecret(request, 'CRON_SECRET')
    expect(res?.status).toBe(401)
  })

  it('accepts matching bearer token', () => {
    process.env.CRON_SECRET = 'expected'
    const request = new Request('http://localhost/api/cron/test', {
      headers: { authorization: 'Bearer expected' },
    })
    expect(requireBearerSecret(request, 'CRON_SECRET')).toBeNull()
  })
})

describe('requireHeaderSecret', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'test' }
    delete process.env.CACHE_PURGE_SECRET
  })

  afterAll(() => {
    process.env = env
  })

  it('rejects missing header when secret is configured', () => {
    process.env.CACHE_PURGE_SECRET = 'purge-me'
    const request = new Request('http://localhost/api/cache/purge', { method: 'POST' })
    const res = requireHeaderSecret(request, 'CACHE_PURGE_SECRET', 'x-cache-secret')
    expect(res?.status).toBe(403)
  })
})

describe('blockInProduction', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterAll(() => {
    process.env = env
  })

  it('blocks in production', () => {
    process.env.NODE_ENV = 'production'
    expect(blockInProduction()?.status).toBe(404)
  })

  it('allows in development', () => {
    process.env.NODE_ENV = 'development'
    expect(blockInProduction()).toBeNull()
  })
})
