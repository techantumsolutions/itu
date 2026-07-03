/**
 * Compact display for dashboard KPIs (e.g. 5889 → "5.9K", 102345 → "102K").
 */
export function formatCompactNumber(value: number): string {
  const n = Math.abs(value)
  if (!Number.isFinite(n)) return '0'

  const sign = value < 0 ? '-' : ''

  if (n < 1_000) {
    return `${sign}${new Intl.NumberFormat('en-US').format(Math.round(n))}`
  }

  if (n < 100_000) {
    const compact = Math.round(n / 100) / 10
    return `${sign}${compact}K`
  }

  if (n < 1_000_000) {
    return `${sign}${Math.round(n / 1_000)}K`
  }

  if (n < 10_000_000) {
    const compact = (n / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `${sign}${compact}M`
  }

  return `${sign}${Math.round(n / 1_000_000)}M`
}
