/**
 * Paginated PostgREST fetch helper — avoids unbounded single-shot loads.
 */

import { supabaseRest } from '@/lib/db/supabase-rest'

export type PaginatedFetchOptions = {
  /** Path+query without limit/offset (filters/select/order already applied) */
  pathWithQuery: string
  pageSize?: number
  /** Hard cap on total rows collected */
  maxRows?: number
  init?: RequestInit
}

/**
 * Walk pages until short page or maxRows. Always bounded.
 */
export async function fetchPostgrestPages<T = Record<string, unknown>>(
  opts: PaginatedFetchOptions,
): Promise<T[]> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 500, 50), 1000)
  const maxRows = Math.min(Math.max(opts.maxRows ?? 10_000, pageSize), 50_000)
  const rows: T[] = []
  let offset = 0

  const base = opts.pathWithQuery.replace(/&?(limit|offset)=\d+/gi, '')
  const joiner = base.includes('?') ? '&' : '?'

  while (rows.length < maxRows) {
    const limit = Math.min(pageSize, maxRows - rows.length)
    const res = await supabaseRest(
      `${base}${joiner}limit=${limit}&offset=${offset}`,
      { cache: 'no-store', ...opts.init },
    )
    if (!res.ok) break
    const batch = (await res.json().catch(() => [])) as T[]
    if (!Array.isArray(batch) || batch.length === 0) break
    rows.push(...batch)
    if (batch.length < limit) break
    offset += batch.length
  }

  return rows
}

/** Parse Content-Range total from a Prefer: count=exact response. */
export function parseContentRangeTotal(res: Response): number | null {
  const range = res.headers.get('Content-Range') ?? res.headers.get('content-range') ?? ''
  const match = range.match(/\/(\d+|\*)$/)
  if (!match || match[1] === '*') return null
  const n = parseInt(match[1], 10)
  return Number.isFinite(n) ? n : null
}
