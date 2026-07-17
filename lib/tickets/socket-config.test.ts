import {
  getPublicSocketServerUrl,
  getSocketBroadcastUrl,
  getSocketServerUrl,
  getBroadcastSecret,
} from '@/lib/tickets/socket-config'

describe('socket-config', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.SOCKET_SERVER_URL
    delete process.env.SOCKET_HOST
    delete process.env.SOCKET_PORT
    delete process.env.NEXT_PUBLIC_SOCKET_SERVER_URL
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.SOCKET_SERVER_DISABLED
  })

  afterAll(() => {
    process.env = env
  })

  it('uses SOCKET_SERVER_URL for broadcast endpoint', () => {
    process.env.SOCKET_SERVER_URL = 'http://127.0.0.1:3001'
    expect(getSocketServerUrl()).toBe('http://127.0.0.1:3001')
    expect(getSocketBroadcastUrl()).toBe('http://127.0.0.1:3001/api/broadcast')
  })

  it('derives public socket URL from NEXT_PUBLIC_APP_URL with socket port', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://194.164.150.223:4009'
    process.env.SOCKET_PORT = '3001'
    expect(getPublicSocketServerUrl()).toBe('http://194.164.150.223:3001')
  })

  it('prefers NEXT_PUBLIC_SOCKET_SERVER_URL', () => {
    process.env.NEXT_PUBLIC_SOCKET_SERVER_URL = 'http://example.com:3001'
    process.env.NEXT_PUBLIC_APP_URL = 'http://194.164.150.223:4009'
    expect(getPublicSocketServerUrl()).toBe('http://example.com:3001')
  })
})

describe('getBroadcastSecret', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'test' }
    delete process.env.SOCKET_BROADCAST_SECRET
  })

  afterAll(() => {
    process.env = env
  })

  it('returns the configured secret', () => {
    process.env.SOCKET_BROADCAST_SECRET = 'super-secret'
    expect(getBroadcastSecret()).toBe('super-secret')
  })

  it('fails fast in production when the secret is missing', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.SOCKET_BROADCAST_SECRET
    expect(() => getBroadcastSecret()).toThrow(/SOCKET_BROADCAST_SECRET is required/)
  })

  it('uses a documented dev fallback outside production when unset', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.SOCKET_BROADCAST_SECRET
    const secret = getBroadcastSecret()
    expect(typeof secret).toBe('string')
    expect(secret.length).toBeGreaterThan(0)
  })
})
