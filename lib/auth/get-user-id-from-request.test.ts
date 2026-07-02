import { getUserIdFromRequest, buildUserAuthHeaders } from '@/lib/auth/get-user-id-from-request'

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('getUserIdFromRequest', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'test' }
    delete process.env.ALLOW_INSECURE_USER_HEADERS
  })

  afterAll(() => {
    process.env = env
  })

  it('does not trust x-user-id header by default', async () => {
    const request = new Request('http://localhost/api/topup/prepare-checkout', {
      headers: {
        'x-user-id': USER_ID,
        'x-user-email': 'lovely@sjmedialabs.com',
      },
    })
    await expect(getUserIdFromRequest(request)).resolves.toBeNull()
  })

  it('reads x-user-id only when ALLOW_INSECURE_USER_HEADERS=true outside production', async () => {
    process.env.ALLOW_INSECURE_USER_HEADERS = 'true'
    const request = new Request('http://localhost/api/topup/prepare-checkout', {
      headers: {
        'x-user-id': USER_ID,
      },
    })
    await expect(getUserIdFromRequest(request)).resolves.toBe(USER_ID)
  })

  it('never trusts x-user-id header in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.ALLOW_INSECURE_USER_HEADERS = 'true'
    const request = new Request('http://localhost/api/topup/prepare-checkout', {
      headers: {
        'x-user-id': USER_ID,
      },
    })
    await expect(getUserIdFromRequest(request)).resolves.toBeNull()
  })

  it('builds auth headers for checkout requests', () => {
    expect(
      buildUserAuthHeaders({
        id: USER_ID,
        email: 'lovely@sjmedialabs.com',
        name: 'Lovely',
        role: 'user',
      }),
    ).toEqual({
      'x-user-id': USER_ID,
      'x-user-email': 'lovely@sjmedialabs.com',
      'x-user-name': 'Lovely',
      'x-user-role': 'user',
    })
  })
})
