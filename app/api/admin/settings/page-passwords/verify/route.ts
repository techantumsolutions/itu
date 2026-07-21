import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'

function findProtectedConfig(pathname: string, config: Record<string, string>) {
  if (config[pathname]) return config[pathname]
  for (const key of Object.keys(config)) {
    if (!config[key]) continue
    if (pathname.startsWith(key + '/') || pathname === key) {
      return config[key]
    }
  }
  return null
}

export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.view')
  if (denied) return denied

  try {
    const body = (await request.json().catch(() => ({}))) as { path?: string; password?: string }
    const path = body.path ?? ''
    const password = body.password ?? ''

    if (!path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 })
    }

    const res = await supabaseRest(`app_settings?key=eq.page_passwords&select=value&limit=1`)
    let passwords: Record<string, string> = {}
    if (res.ok) {
      const rows = (await res.json().catch(() => [])) as { value: Record<string, string> }[]
      if (rows && rows.length > 0 && rows[0]?.value) {
        passwords = rows[0].value
      }
    }

    const expectedPassword = findProtectedConfig(path, passwords)
    if (!expectedPassword) {
      // Path is not protected, bypass
      return NextResponse.json({ ok: true })
    }

    if (password === expectedPassword) {
      return NextResponse.json({ ok: true })
    } else {
      return NextResponse.json({ ok: false, error: 'Incorrect page password' })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'verification_failed' }, { status: 500 })
  }
}
