import { createHmac } from 'node:crypto'
import { verifySupabaseAccessTokenLocally } from '@/lib/auth/verify-jwt-local'

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const data = `${header}.${body}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

describe('verifySupabaseAccessTokenLocally', () => {
  const secret = 'test-jwt-secret-for-unit-tests'

  it('accepts a valid unexpired token', () => {
    const token = signHs256(
      { sub: '11111111-1111-4111-8111-111111111111', exp: Math.floor(Date.now() / 1000) + 3600, email: 'a@b.co' },
      secret,
    )
    const claims = verifySupabaseAccessTokenLocally(token, secret)
    expect(claims?.sub).toBe('11111111-1111-4111-8111-111111111111')
    expect(claims?.email).toBe('a@b.co')
  })

  it('rejects expired tokens', () => {
    const token = signHs256(
      { sub: '11111111-1111-4111-8111-111111111111', exp: Math.floor(Date.now() / 1000) - 10 },
      secret,
    )
    expect(verifySupabaseAccessTokenLocally(token, secret)).toBeNull()
  })

  it('rejects bad signatures', () => {
    const token = signHs256(
      { sub: '11111111-1111-4111-8111-111111111111', exp: Math.floor(Date.now() / 1000) + 3600 },
      secret,
    )
    expect(verifySupabaseAccessTokenLocally(token, 'other-secret')).toBeNull()
  })
})
