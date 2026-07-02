import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import type { SiteContent } from '@/lib/cms-store'
import { cacheDel, cacheGetJson, cacheSetJson } from '@/lib/cache/redis'
import { logAdminActivity } from '@/lib/auth/audit'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'

export const dynamic = 'force-dynamic'

const CMS_ID = 'default'
const CMS_CACHE_KEY = `cms:site:${CMS_ID}`
const CMS_BROWSER_CACHE = 'public, max-age=60, stale-while-revalidate=300'

function cmsResponse(payload: unknown, init?: { status?: number }) {
  return NextResponse.json(payload, {
    status: init?.status ?? 200,
    headers: { 'Cache-Control': CMS_BROWSER_CACHE },
  })
}

export async function GET() {
  try {
    const cached = await cacheGetJson<{ content: SiteContent | null; ok: boolean }>(CMS_CACHE_KEY)
    if (cached) {
      return cmsResponse(cached)
    }

    const res = await supabaseRest(`cms_site?select=content&id=eq.${encodeURIComponent(CMS_ID)}&limit=1`)
    if (!res.ok) {
      const payload = { content: null as SiteContent | null, ok: false, error: await res.text() }
      await cacheSetJson(CMS_CACHE_KEY, payload, 5)
      return NextResponse.json(payload, {
        status: 200,
        headers: { 'Cache-Control': 'public, max-age=5' },
      })
    }
    const rows = (await res.json()) as Array<{ content?: unknown }>
    const content = (rows?.[0]?.content ?? null) as SiteContent | null
    const payload = { content, ok: true }
    await cacheSetJson(CMS_CACHE_KEY, payload, 60)

    return cmsResponse(payload)
  } catch (e) {
    const payload = { content: null as SiteContent | null, ok: false, error: 'cms_unavailable' }
    await cacheSetJson(CMS_CACHE_KEY, payload, 5)
    return NextResponse.json(payload, {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=5' },
    })
  }
}

export async function POST(req: Request) {
  const denied = await requireAdminPermission(req, 'cms.edit')
  if (denied) return denied

  try {
    const body = (await req.json().catch(() => null)) as { content?: SiteContent } | null
    if (!body?.content) return NextResponse.json({ ok: false, error: 'Missing content' }, { status: 400 })

    const payload = [{ id: CMS_ID, content: body.content, updated_at: new Date().toISOString() }]
    const res = await supabaseRest('cms_site', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: await res.text() }, { status: 500 })
    }

    await cacheDel(CMS_CACHE_KEY)

    await logAdminActivity({
      action: 'Update CMS Content',
      pageName: 'CMS',
      details: body.content,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed to save CMS content' }, { status: 500 })
  }
}

