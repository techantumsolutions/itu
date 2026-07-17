import { rateLimit } from '@/lib/security/rate-limit'
import { redisExec } from '@/lib/cache/redis'

jest.mock('@/lib/cache/redis', () => ({
  redisExec: jest.fn(),
}))

const mockRedisExec = redisExec as jest.MockedFunction<typeof redisExec>

describe('rateLimit', () => {
  beforeEach(() => {
    mockRedisExec.mockReset()
  })

  it('allows when under the limit', async () => {
    mockRedisExec.mockResolvedValue([1, 9, 60] as never)
    const r = await rateLimit({ key: 'k', limit: 10, windowSeconds: 60 })
    expect(r.ok).toBe(true)
    expect(r.remaining).toBe(9)
    expect(r.resetSeconds).toBe(60)
  })

  it('blocks when over the limit', async () => {
    mockRedisExec.mockResolvedValue([11, -1, 45] as never)
    const r = await rateLimit({ key: 'k', limit: 10, windowSeconds: 60 })
    expect(r.ok).toBe(false)
    expect(r.remaining).toBe(0)
  })

  it('fails OPEN when Redis is unavailable and failClosed is not set', async () => {
    mockRedisExec.mockRejectedValue(new Error('redis_not_configured'))
    const r = await rateLimit({ key: 'k', limit: 10, windowSeconds: 60 })
    expect(r.ok).toBe(true)
  })

  it('fails CLOSED when Redis is unavailable and failClosed is true', async () => {
    mockRedisExec.mockRejectedValue(new Error('redis_not_configured'))
    const r = await rateLimit({ key: 'k', limit: 10, windowSeconds: 60, failClosed: true })
    expect(r.ok).toBe(false)
    expect(r.remaining).toBe(0)
    expect(r.resetSeconds).toBe(60)
  })
})
