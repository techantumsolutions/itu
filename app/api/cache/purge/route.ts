import { NextResponse } from 'next/server'
import { requireHeaderSecret } from '@/lib/security/require-secret'
import { runtimeEnv } from '@/lib/env/runtime'
import { cacheDelByPrefix, cacheDel } from '@/lib/cache/redis'

export async function POST(req: Request) {
  const denied = requireHeaderSecret(req, 'CACHE_PURGE_SECRET', 'x-cache-secret', {
    missingMessage: 'CACHE_PURGE_SECRET is not configured',
  })
  if (denied) return denied

  // Purge known namespaces.
  const cms = await cacheDelByPrefix('cms:')
  const catalog = await cacheDelByPrefix('catalog:')
  const aggregator = await cacheDelByPrefix('aggregator:')

  // Also remove any legacy key explicitly if present.
  await cacheDel('cms:site:default')

  return NextResponse.json({ ok: true, purged: { cms, catalog, aggregator }, configured: Boolean(runtimeEnv('CACHE_PURGE_SECRET')) })
}
