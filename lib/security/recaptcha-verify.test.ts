import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'
import { resolveAllowedRecaptchaHostnames, verifyRecaptchaToken } from '@/lib/security/recaptcha-verify'

describe('recaptcha-verify', () => {
  const originalFetch = global.fetch
  const originalSecret = process.env.RECAPTCHA_SECRET_KEY

  beforeEach(() => {
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.RECAPTCHA_SECRET_KEY = originalSecret
    jest.restoreAllMocks()
  })

  it('resolveAllowedRecaptchaHostnames includes app URL host and localhost', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000'
    const hosts = resolveAllowedRecaptchaHostnames('localhost:3000')
    expect(hosts).toContain('127.0.0.1')
    expect(hosts).toContain('localhost')
  })

  it('rejects missing token', async () => {
    const result = await verifyRecaptchaToken({ token: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('robot')
  })

  it('accepts valid siteverify response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        challenge_ts: new Date().toISOString(),
        hostname: 'localhost',
      }),
    }) as unknown as typeof fetch

    const result = await verifyRecaptchaToken({
      token: 'valid-token',
      allowedHostnames: ['localhost'],
    })
    expect(result.ok).toBe(true)
  })

  it('rejects hostname mismatch', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        challenge_ts: new Date().toISOString(),
        hostname: 'evil.example.com',
      }),
    }) as unknown as typeof fetch

    const result = await verifyRecaptchaToken({
      token: 'valid-token',
      allowedHostnames: ['localhost'],
    })
    expect(result.ok).toBe(false)
  })

  it('rejects expired challenge', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        challenge_ts: new Date(Date.now() - 600_000).toISOString(),
        hostname: 'localhost',
      }),
    }) as unknown as typeof fetch

    const result = await verifyRecaptchaToken({
      token: 'valid-token',
      allowedHostnames: ['localhost'],
      maxAgeSeconds: 120,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('expired')
  })
})
