import { getUserIdFromRequest, buildUserAuthHeaders } from '@/lib/auth/get-user-id-from-request'

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('getUserIdFromRequest', () => {
  it('reads x-user-id when auth cookies are missing', async () => {
    const request = new Request('http://localhost/api/topup/prepare-checkout', {
      headers: {
        'x-user-id': USER_ID,
        'x-user-email': 'lovely@sjmedialabs.com',
      },
    })
    await expect(getUserIdFromRequest(request)).resolves.toBe(USER_ID)
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
