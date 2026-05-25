import { runtimeEnv } from '@/lib/env/runtime'

/** Create a Supabase Auth user (requires service role key). */
export async function supabaseAdminCreateUser(params: {
  email: string
  password: string
  name?: string
}): Promise<{ id: string; email: string }> {
  const baseRaw = runtimeEnv('SUPABASE_URL')
  const key = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!baseRaw || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const base = baseRaw.replace(/\/$/, '')
  const res = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email.trim().toLowerCase(),
      password: params.password,
      email_confirm: true,
      user_metadata: { name: params.name ?? '' },
    }),
    cache: 'no-store',
  })
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg =
      (typeof j.msg === 'string' && j.msg) ||
      (typeof j.message === 'string' && j.message) ||
      (typeof j.error_description === 'string' && j.error_description) ||
      `create_user_failed_${res.status}`
    throw new Error(msg)
  }
  const id = typeof j.id === 'string' ? j.id : ''
  const email = typeof j.email === 'string' ? j.email : params.email
  if (!id) throw new Error('create_user_missing_id')
  return { id, email }
}
