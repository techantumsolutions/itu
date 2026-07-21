/** CMS persistence service — load/save site content via /api/cms. */

export async function fetchCmsContent(): Promise<unknown | null> {
  const res = await fetch('/api/cms', { cache: 'no-store' })
  if (!res.ok) return null
  const data = await res.json()
  return data?.content ?? null
}

export async function saveCmsContent(content: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/cms', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    return { ok: false, error: err || res.statusText }
  }
  return { ok: true }
}
