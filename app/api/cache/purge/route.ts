import { NextResponse } from 'next/server'
import { runtimeEnv } from '@/lib/env/runtime'
import { cacheDelByPrefix, cacheDel } from '@/lib/cache/redis'

export async function POST(req: Request) {
  const secret = runtimeEnv('CACHE_PURGE_SECRET')
  if (secret) {
    const provided = req.headers.get('x-cache-secret') ?? ''
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    }
  }

  // Purge known namespaces.
  const cms = await cacheDelByPrefix('cms:')
  const catalog = await cacheDelByPrefix('catalog:')

  // Also remove any legacy key explicitly if present.
  await cacheDel('cms:site:default')

  return NextResponse.json({ ok: true, purged: { cms, catalog } })
}

