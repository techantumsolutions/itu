import { NextResponse } from 'next/server'
import { supabaseRest } from '@/lib/db/supabase-rest'
import type { SiteContent } from '@/lib/cms-store'
import { cacheDel, cacheGetJson, cacheSetJson } from '@/lib/cache/redis'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const CMS_ID = 'default'
const CMS_CACHE_KEY = `cms:site:${CMS_ID}`

export async function GET() {
  try {
    const cached = await cacheGetJson<{ content: SiteContent | null; ok: boolean }>(CMS_CACHE_KEY)
    if (cached) {
      return NextResponse.json(
        cached,
        { headers: { 'Cache-Control': 'no-store, max-age=0' } },
      )
    }

    const res = await supabaseRest(`cms_site?select=content&id=eq.${encodeURIComponent(CMS_ID)}&limit=1`)
    if (!res.ok) {
      const payload = { content: null as SiteContent | null, ok: false, error: await res.text() }
      // Cache negative briefly to avoid hammering Supabase during outages.
      await cacheSetJson(CMS_CACHE_KEY, payload, 5)
      return NextResponse.json(payload, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } })
    }
    const rows = (await res.json()) as Array<{ content?: unknown }>
    const content = (rows?.[0]?.content ?? null) as SiteContent | null
    const payload = { content, ok: true }
    await cacheSetJson(CMS_CACHE_KEY, payload, 60)
    return NextResponse.json(
      payload,
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
  } catch (e) {
    // If Supabase env/table isn't configured yet, fall back to client defaults.
    const payload = { content: null as SiteContent | null, ok: false, error: 'cms_unavailable' }
    await cacheSetJson(CMS_CACHE_KEY, payload, 5)
    return NextResponse.json(payload, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } })
  }
}

export async function POST(req: Request) {
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
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'Failed to save CMS content' }, { status: 500 })
  }
}

