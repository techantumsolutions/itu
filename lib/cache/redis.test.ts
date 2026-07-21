import {
  cacheGetJson,
  cacheSetJson,
  cacheDel,
  cacheDelByPrefix,
  getCacheStats,
  resetCacheStats,
  clearLocalCacheForTests,
} from '@/lib/cache/redis'

jest.mock('@/lib/env/runtime', () => ({
  runtimeEnv: jest.fn((key: string) => (key === 'REDIS_URL' ? 'redis://127.0.0.1:6379' : undefined)),
}))

const mockPipeline = {
  unlink: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
}

const mockRedis = {
  status: 'ready',
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  unlink: jest.fn().mockResolvedValue(1),
  scan: jest.fn(),
  pipeline: jest.fn(() => mockPipeline),
  on: jest.fn(),
}

jest.mock('ioredis', () => jest.fn(() => mockRedis))

describe('redis cache layer', () => {
  beforeEach(() => {
    process.env.CACHE_L1_ENABLED = 'true'
    jest.clearAllMocks()
    resetCacheStats()
    clearLocalCacheForTests()
    mockRedis.status = 'ready'
    mockRedis.get.mockReset()
    mockRedis.scan.mockReset()
    mockRedis.scan.mockResolvedValue(['0', []])
  })

  afterEach(() => {
    delete process.env.CACHE_L1_ENABLED
  })

  it('tracks L1 hits without calling Redis on repeated reads', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ ok: true }))
    await cacheGetJson('test:l1')
    await cacheGetJson('test:l1')

    expect(mockRedis.get).toHaveBeenCalledTimes(1)
    const stats = getCacheStats()
    expect(stats.hits).toBe(1)
    expect(stats.l1Hits).toBe(1)
  })

  it('uses pipeline unlink for prefix delete', async () => {
    mockRedis.scan
      .mockResolvedValueOnce(['0', ['catalog:public:a', 'catalog:public:b']])
    const deleted = await cacheDelByPrefix('catalog:public:')
    expect(deleted).toBe(2)
    expect(mockPipeline.unlink).toHaveBeenCalledTimes(2)
  })

  it('invalidates L1 on cacheDel', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ v: 1 }))
    await cacheGetJson('test:del')
    await cacheDel('test:del')
    await cacheGetJson('test:del')
    expect(mockRedis.get).toHaveBeenCalledTimes(2)
  })

  it('counts misses when key absent', async () => {
    mockRedis.get.mockResolvedValue(null)
    const val = await cacheGetJson('missing:key')
    expect(val).toBeNull()
    expect(getCacheStats().misses).toBe(1)
  })

  it('updates L1 on cacheSetJson', async () => {
    await cacheSetJson('test:set', { n: 1 }, 60)
    mockRedis.get.mockClear()
    await cacheGetJson('test:set')
    expect(mockRedis.get).not.toHaveBeenCalled()
    expect(getCacheStats().l1Hits).toBe(1)
  })
})
