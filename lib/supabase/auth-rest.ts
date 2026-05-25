import { runtimeEnv } from '@/lib/env/runtime'

function supabaseAuthBaseUrl(): string {
  const base = runtimeEnv('SUPABASE_URL')
  if (!base) throw new Error('SUPABASE_URL missing')
  return base.replace(/\/$/, '')
}

function supabaseAnonKey(): string {
  const k = runtimeEnv('SUPABASE_ANON_KEY')
  if (!k) throw new Error('SUPABASE_ANON_KEY missing')
  return k
}

export type SupabaseSession = {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  expires_at?: number
}

export type SupabaseUser = {
  id: string
  email?: string
  phone?: string
  user_metadata?: Record<string, unknown>
}

export async function supabaseSignUpEmail(payload: {
  email: string
  password: string
  data?: Record<string, unknown>
}): Promise<{ user: SupabaseUser | null; session: SupabaseSession | null }> {
  const res = await fetch(`${supabaseAuthBaseUrl()}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      Authorization: `Bearer ${supabaseAnonKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as any
  if (!res.ok) throw new Error(json?.msg || json?.error_description || json?.message || 'signup_failed')
  return { user: json?.user ?? null, session: json?.session ?? null }
}

export async function supabaseSignInWithPassword(payload: {
  email: string
  password: string
}): Promise<{ user: SupabaseUser | null; session: SupabaseSession | null }> {
  const res = await fetch(`${supabaseAuthBaseUrl()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey(),
      Authorization: `Bearer ${supabaseAnonKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as any
  if (!res.ok) throw new Error(json?.error_description || json?.msg || json?.message || 'login_failed')
  return { user: json?.user ?? null, session: json ?? null }
}

export async function supabaseGetUser(accessToken: string): Promise<SupabaseUser | null> {
  const res = await fetch(`${supabaseAuthBaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey(),
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as any
  if (!res.ok) return null
  return json ?? null
}

