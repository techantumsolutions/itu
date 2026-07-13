import { UAParser } from 'ua-parser-js'
import { runtimeEnv } from '@/lib/env/runtime'
import { supabaseRest } from '@/lib/db/supabase-rest'

export type TrustedDeviceRow = {
  id: string
  user_id: string
  device_fingerprint: string
  device_name: string | null
  last_login_at: string | null
  created_at: string | null
  last_ip: string | null
  last_country: string | null
  device_info: string | null
}

export function deviceInfoFromUserAgent(userAgent: string): string {
  const parser = new UAParser(userAgent)
  const result = parser.getResult()
  return `${result.browser.name || 'Unknown Browser'} on ${result.os.name || 'Unknown OS'}`
}

/** Decode JWT `iat` (seconds) without verifying signature. */
export function getAccessTokenIssuedAt(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const payload = JSON.parse(json) as { iat?: number }
    return typeof payload.iat === 'number' ? payload.iat : null
  } catch {
    return null
  }
}

export async function isAccessTokenInvalidated(userId: string, accessToken: string): Promise<boolean> {
  try {
    const res = await supabaseRest(
      `profiles?id=eq.${encodeURIComponent(userId)}&select=auth_sessions_invalidated_at&limit=1`,
      { cache: 'no-store' },
    )
    if (!res.ok) return false
    const rows = (await res.json().catch(() => [])) as { auth_sessions_invalidated_at?: string | null }[]
    const invalidatedAt = rows?.[0]?.auth_sessions_invalidated_at
    if (!invalidatedAt) return false
    const iat = getAccessTokenIssuedAt(accessToken)
    if (iat == null) return false
    const cut = Math.floor(new Date(invalidatedAt).getTime() / 1000)
    return iat < cut
  } catch {
    return false
  }
}

export async function upsertTrustedDevice(input: {
  userId: string
  fingerprint: string
  ipAddress?: string
  country?: string
  userAgent?: string
}): Promise<void> {
  const now = new Date().toISOString()
  const deviceInfo = input.userAgent ? deviceInfoFromUserAgent(input.userAgent) : null
  const payload = {
    user_id: input.userId,
    device_fingerprint: input.fingerprint,
    last_login_at: now,
    last_ip: input.ipAddress || null,
    last_country: input.country || null,
    device_info: deviceInfo,
  }

  const upsertRes = await supabaseRest('trusted_devices?on_conflict=user_id,device_fingerprint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([payload]),
  })

  if (upsertRes.ok) return

  // Fallback when unique index/upsert is unavailable: update existing, else insert
  const patchRes = await supabaseRest(
    `trusted_devices?user_id=eq.${encodeURIComponent(input.userId)}&device_fingerprint=eq.${encodeURIComponent(input.fingerprint)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        last_login_at: now,
        last_ip: payload.last_ip,
        last_country: payload.last_country,
        device_info: payload.device_info,
      }),
    },
  )

  if (patchRes.ok) {
    // PostgREST returns 204 even when 0 rows matched — verify
    const checkRes = await supabaseRest(
      `trusted_devices?user_id=eq.${encodeURIComponent(input.userId)}&device_fingerprint=eq.${encodeURIComponent(input.fingerprint)}&select=id&limit=1`,
      { cache: 'no-store' },
    )
    if (checkRes.ok) {
      const rows = await checkRes.json().catch(() => [])
      if (Array.isArray(rows) && rows.length > 0) return
    }
  }

  const insertRes = await supabaseRest('trusted_devices', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
  if (!insertRes.ok) {
    const errText = await insertRes.text().catch(() => '')
    throw new Error(`Failed to upsert trusted device: ${errText || insertRes.status}`)
  }
}

/** Sign the user out of all Supabase Auth refresh sessions (service role). */
export async function supabaseAdminLogoutUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const base = runtimeEnv('SUPABASE_URL')?.replace(/\/$/, '')
  const serviceKey = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!base || !serviceKey) {
    return { ok: false, error: 'Supabase admin credentials missing' }
  }

  const res = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}/logout`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, error: text || `logout_failed_${res.status}` }
  }
  return { ok: true }
}

export async function forceLogoutUserSessions(userId: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString()

  // Invalidate any access tokens issued before now
  const patchRes = await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ auth_sessions_invalidated_at: now, updated_at: now }),
  })
  if (!patchRes.ok) {
    return { ok: false, error: await patchRes.text().catch(() => 'failed_to_invalidate_sessions') }
  }

  // Drop trusted devices so next login requires 2FA again
  await supabaseRest(`trusted_devices?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })

  const logout = await supabaseAdminLogoutUser(userId)
  if (!logout.ok) {
    // Still considered success if our invalidation stamp landed; refresh tokens may remain until expiry
    console.warn('[forceLogoutUserSessions] supabase admin logout warning:', logout.error)
  }

  return { ok: true }
}
