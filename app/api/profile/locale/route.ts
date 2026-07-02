import { NextResponse } from 'next/server'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import { runtimeEnv } from '@/lib/env/runtime'

/**
 * Persists locale preferences into Supabase `profiles` for the authenticated user only.
 */
export async function POST(req: Request) {
  const authenticatedUserId = await getUserIdFromRequest(req)
  if (!authenticatedUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as
    | { userId?: string; country?: string; language?: string; currency?: string }
    | null

  const userId = body?.userId
  const country = body?.country
  const language = body?.language
  const currency = body?.currency

  if (!userId || !country || !language || !currency) {
    return NextResponse.json({ ok: false, error: 'Missing fields' }, { status: 400 })
  }

  if (userId !== authenticatedUserId) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const url = runtimeEnv('SUPABASE_URL')
  const serviceKey = runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceKey) {
    return NextResponse.json({ ok: true, persisted: false })
  }

  const res = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      country,
      language,
      currency,
      updated_at: new Date().toISOString(),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return NextResponse.json({ ok: false, persisted: false, error: text || 'Failed to update profile' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, persisted: true })
}
