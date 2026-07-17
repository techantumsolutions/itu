import {
  signOtpUserId,
  verifyOtpUserId,
  verifyOtpSessionCookie,
} from '@/lib/auth/otp-session-cookie'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

describe('otp-session-cookie', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'test', OTP_SESSION_SECRET: 'test-secret' }
  })

  afterAll(() => {
    process.env = env
  })

  it('signs and verifies a round trip', () => {
    const signed = signOtpUserId(USER_ID)
    expect(signed).toContain(`${USER_ID}.`)
    expect(verifyOtpUserId(signed)).toBe(USER_ID)
  })

  it('rejects a legacy unsigned (raw uuid) value', () => {
    expect(verifyOtpUserId(USER_ID)).toBeNull()
  })

  it('rejects a tampered user id (signature no longer matches)', () => {
    const signed = signOtpUserId(USER_ID)
    const sig = signed.slice(signed.lastIndexOf('.') + 1)
    expect(verifyOtpUserId(`${OTHER_ID}.${sig}`)).toBeNull()
  })

  it('rejects a tampered signature', () => {
    const signed = signOtpUserId(USER_ID)
    expect(verifyOtpUserId(`${signed}tamper`)).toBeNull()
    expect(verifyOtpUserId(`${USER_ID}.AAAA`)).toBeNull()
  })

  it('rejects a signature produced with a different secret', () => {
    const signed = signOtpUserId(USER_ID)
    process.env.OTP_SESSION_SECRET = 'a-different-secret'
    expect(verifyOtpUserId(signed)).toBeNull()
  })

  it('rejects a non-uuid subject', () => {
    process.env.OTP_SESSION_SECRET = 'test-secret'
    const signed = signOtpUserId('not-a-uuid')
    expect(verifyOtpUserId(signed)).toBeNull()
  })

  it('rejects empty / null / malformed values', () => {
    expect(verifyOtpUserId('')).toBeNull()
    expect(verifyOtpUserId(null)).toBeNull()
    expect(verifyOtpUserId(undefined)).toBeNull()
    expect(verifyOtpUserId('.')).toBeNull()
    expect(verifyOtpUserId(`${USER_ID}.`)).toBeNull()
  })

  it('parses and verifies from a Cookie header', () => {
    const signed = signOtpUserId(USER_ID)
    const header = `sb-refresh-token=abc; itu-user-id=${encodeURIComponent(signed)}; other=1`
    expect(verifyOtpSessionCookie(header)).toBe(USER_ID)
  })

  it('returns null for a Cookie header with an unsigned itu-user-id', () => {
    const header = `itu-user-id=${USER_ID}`
    expect(verifyOtpSessionCookie(header)).toBeNull()
  })

  it('fails fast in production when OTP_SESSION_SECRET is missing', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.OTP_SESSION_SECRET
    expect(() => signOtpUserId(USER_ID)).toThrow(/OTP_SESSION_SECRET is required/)
    expect(() => verifyOtpUserId(`${USER_ID}.sig`)).toThrow(/OTP_SESSION_SECRET is required/)
  })

  it('works in production when OTP_SESSION_SECRET is set', () => {
    process.env.NODE_ENV = 'production'
    process.env.OTP_SESSION_SECRET = 'prod-secret'
    const signed = signOtpUserId(USER_ID)
    expect(verifyOtpUserId(signed)).toBe(USER_ID)
  })

  it('uses the documented dev fallback outside production without a secret', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.OTP_SESSION_SECRET
    const signed = signOtpUserId(USER_ID)
    expect(verifyOtpUserId(signed)).toBe(USER_ID)
  })
})
