import { bootstrapSuperAdmin } from '@/lib/auth/bootstrap-super-admin'

const ADMIN_EMAIL = 'admin@itu.com'
const EXISTING_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const CREATED_USER_ID = '11111111-2222-3333-4444-555555555555'

jest.mock('@/lib/supabase/admin-users', () => ({
  supabaseAdminCreateUser: jest.fn(),
}))

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRest: jest.fn().mockResolvedValue({ ok: true }),
}))

jest.mock('@/lib/env/runtime', () => ({
  runtimeEnv: (key: string) => {
    const map: Record<string, string> = {
      SUPABASE_URL: 'http://supabase.test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    }
    return map[key] ?? ''
  },
}))

import { supabaseAdminCreateUser } from '@/lib/supabase/admin-users'
import { supabaseRest } from '@/lib/db/supabase-rest'

const mockCreateUser = supabaseAdminCreateUser as jest.MockedFunction<typeof supabaseAdminCreateUser>
const mockSupabaseRest = supabaseRest as jest.MockedFunction<typeof supabaseRest>

function mockListUsers(users: { id: string; email?: string }[]) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url.includes('/auth/v1/admin/users?')) {
      return new Response(JSON.stringify({ users }), { status: 200 })
    }
    if (url.includes('/auth/v1/admin/users/') && init?.method === 'PUT') {
      return new Response(JSON.stringify({ id: EXISTING_USER_ID }), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  })
}

describe('bootstrapSuperAdmin', () => {
  const env = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...env }
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD
    delete process.env.ADMIN_BOOTSTRAP_EMAIL
    mockCreateUser.mockResolvedValue({ id: CREATED_USER_ID, email: ADMIN_EMAIL })
  })

  afterAll(() => {
    process.env = env
    jest.restoreAllMocks()
  })

  it('creates missing admin with bootstrap password', async () => {
    const fetchSpy = mockListUsers([])

    const result = await bootstrapSuperAdmin()

    expect(result.created).toBe(true)
    expect(result.passwordReset).toBe(false)
    expect(result.passwordSource).toBe('default')
    expect(result.userId).toBe(CREATED_USER_ID)
    expect(mockCreateUser).toHaveBeenCalledWith({
      email: ADMIN_EMAIL,
      password: '1234567890',
      name: 'ITU Admin',
    })
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(mockSupabaseRest).toHaveBeenCalled()
  })

  it('preserves existing admin password by default', async () => {
    const fetchSpy = mockListUsers([{ id: EXISTING_USER_ID, email: ADMIN_EMAIL }])

    const result = await bootstrapSuperAdmin()

    expect(result.created).toBe(false)
    expect(result.passwordReset).toBe(false)
    expect(result.passwordSource).toBeNull()
    expect(result.userId).toBe(EXISTING_USER_ID)
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(fetchSpy.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    expect(mockSupabaseRest).toHaveBeenCalled()
  })

  it('is idempotent for existing admin without resetPassword', async () => {
    mockListUsers([{ id: EXISTING_USER_ID, email: ADMIN_EMAIL }])

    const first = await bootstrapSuperAdmin()
    const second = await bootstrapSuperAdmin()

    expect(first.passwordReset).toBe(false)
    expect(second.passwordReset).toBe(false)
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining(`/auth/v1/admin/users/${EXISTING_USER_ID}`),
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('resets password only when resetPassword=true', async () => {
    const fetchSpy = mockListUsers([{ id: EXISTING_USER_ID, email: ADMIN_EMAIL }])

    const result = await bootstrapSuperAdmin({ resetPassword: true, password: 'NewSecret!234' })

    expect(result.created).toBe(false)
    expect(result.passwordReset).toBe(true)
    expect(result.passwordSource).toBe('env')
    expect(mockCreateUser).not.toHaveBeenCalled()

    const putCall = fetchSpy.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(putCall).toBeDefined()
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({
      password: 'NewSecret!234',
      email_confirm: true,
    })
  })

  it('uses env password source when ADMIN_BOOTSTRAP_PASSWORD is set on create', async () => {
    process.env.ADMIN_BOOTSTRAP_PASSWORD = 'from-env-secret'
    mockListUsers([])

    const result = await bootstrapSuperAdmin()

    expect(result.passwordSource).toBe('env')
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'from-env-secret' }),
    )
  })
})

describe('phase1 verification script idempotency', () => {
  it('does not call dev-bootstrap-admin', async () => {
    const source = await import('fs/promises').then((fs) =>
      fs.readFile(require.resolve('../../scratch/phase1-security-verify.ts'), 'utf8'),
    )
    expect(source).not.toMatch(/dev-bootstrap-admin/)
    expect(source).not.toMatch(/bootstrapSuperAdmin/)
  })
})
