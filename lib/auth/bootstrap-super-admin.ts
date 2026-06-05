import { runtimeEnv } from '@/lib/env/runtime'
import { supabaseAdminCreateUser } from '@/lib/supabase/admin-users'
import { supabaseRest } from '@/lib/db/supabase-rest'

export type BootstrapSuperAdminResult = {
  email: string
  userId: string
  created: boolean
  passwordSource: 'env' | 'default'
}

async function listUsersByEmail(email: string): Promise<{ id: string; email?: string }[]> {
  const baseRaw = runtimeEnv('SUPABASE_URL')
  const key = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!baseRaw || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const base = baseRaw.replace(/\/$/, '')
  const out: { id: string; email?: string }[] = []
  let page = 1
  const perPage = 200
  const target = email.trim().toLowerCase()
  for (;;) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as { users?: { id: string; email?: string }[] }
    if (!res.ok) throw new Error(`list_users_failed_${res.status}`)
    const users = json.users ?? []
    for (const u of users) {
      if ((u.email ?? '').trim().toLowerCase() === target) out.push(u)
    }
    if (users.length < perPage) break
    page += 1
    if (page > 50) break
  }
  return out
}

async function updateUserPassword(userId: string, password: string): Promise<void> {
  const baseRaw = runtimeEnv('SUPABASE_URL')
  const key = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!baseRaw || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const base = baseRaw.replace(/\/$/, '')
  const res = await fetch(`${base}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password, email_confirm: true }),
    cache: 'no-store',
  })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg =
      (typeof j.msg === 'string' && j.msg) ||
      (typeof j.message === 'string' && j.message) ||
      `update_password_failed_${res.status}`
    throw new Error(msg)
  }
}

async function upsertSuperAdminProfile(userId: string, email: string, name: string): Promise<void> {
  await supabaseRest('profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([
      {
        id: userId,
        email,
        name,
        app_role: 'super_admin',
        admin_permissions: null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
    ]),
  })
}

/** Create or update canonical super-admin Auth user + profiles row. */
export async function bootstrapSuperAdmin(options?: {
  email?: string
  password?: string
  name?: string
}): Promise<BootstrapSuperAdminResult> {
  const email = (options?.email ?? process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@itu.com').trim().toLowerCase()
  const password = options?.password ?? process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '1234567890'
  const name = options?.name ?? process.env.ADMIN_BOOTSTRAP_NAME ?? 'ITU Admin'
  const passwordSource = options?.password || process.env.ADMIN_BOOTSTRAP_PASSWORD ? 'env' : 'default'

  if (!runtimeEnv('SUPABASE_URL') || !runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }

  let userId: string
  let created = false
  const existing = await listUsersByEmail(email)
  if (existing.length > 0) {
    userId = existing[0]!.id
    await updateUserPassword(userId, password)
  } else {
    const row = await supabaseAdminCreateUser({ email, password, name })
    userId = row.id
    created = true
  }

  await upsertSuperAdminProfile(userId, email, name)

  return { email, userId, created, passwordSource }
}
