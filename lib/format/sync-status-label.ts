/**
 * Human-readable label for catalog / dashboard sync timestamps.
 */
export function formatSyncStatusLabel(syncedAt: string | null | undefined, now = Date.now()): string {
  if (!syncedAt) return 'Live Data'

  const ts = Date.parse(syncedAt)
  if (!Number.isFinite(ts)) return 'Live Data'

  const diffMs = Math.max(0, now - ts)
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'Updated just now'

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) {
    return diffMin === 1 ? 'Synced 1 minute ago' : `Synced ${diffMin} minutes ago`
  }

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) {
    return diffHr === 1 ? 'Synced 1 hour ago' : `Synced ${diffHr} hours ago`
  }

  const diffDay = Math.floor(diffHr / 24)
  return diffDay === 1 ? 'Synced 1 day ago' : `Synced ${diffDay} days ago`
}
