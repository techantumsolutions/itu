/**
 * Date range utilities for the Reports Engine.
 * Resolves preset labels to concrete ISO date strings.
 */

import type { DateRange, DateRangePreset } from './types'

function toISO(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function resolveDateRange(preset: DateRangePreset, customFrom?: string, customTo?: string): DateRange {
  const now  = new Date()
  const today = toISO(now)

  switch (preset) {
    case 'all_time': {
      return { from: '', to: '', preset }
    }
    case 'today': {
      return { from: today, to: today, preset }
    }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const iso = toISO(y)
      return { from: iso, to: iso, preset }
    }
    case 'this_week': {
      const day = now.getDay()
      const mondayDiff = now.getDate() - day + (day === 0 ? -6 : 1)
      const from = new Date(now.getFullYear(), now.getMonth(), mondayDiff)
      return { from: toISO(from), to: today, preset }
    }
    case 'last_week': {
      const day = now.getDay()
      const mondayDiff = now.getDate() - day + (day === 0 ? -6 : 1)
      const from = new Date(now.getFullYear(), now.getMonth(), mondayDiff - 7)
      const to   = new Date(now.getFullYear(), now.getMonth(), mondayDiff - 1)
      return { from: toISO(from), to: toISO(to), preset }
    }
    case 'last_7_days': {
      const d = new Date(now)
      d.setDate(d.getDate() - 6)
      return { from: toISO(d), to: today, preset }
    }
    case 'last_30_days': {
      const d = new Date(now)
      d.setDate(d.getDate() - 29)
      return { from: toISO(d), to: today, preset }
    }
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: toISO(from), to: today, preset }
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const to   = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: toISO(from), to: toISO(to), preset }
    }
    case 'this_quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3
      const from = new Date(now.getFullYear(), qStartMonth, 1)
      return { from: toISO(from), to: today, preset }
    }
    case 'last_quarter': {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3 - 3
      const from = new Date(now.getFullYear(), qStartMonth, 1)
      const to   = new Date(now.getFullYear(), qStartMonth + 3, 0)
      return { from: toISO(from), to: toISO(to), preset }
    }
    case 'last_3_months': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 3)
      return { from: toISO(d), to: today, preset }
    }
    case 'last_6_months': {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 6)
      return { from: toISO(d), to: today, preset }
    }
    case 'this_year': {
      const from = new Date(now.getFullYear(), 0, 1)
      return { from: toISO(from), to: today, preset }
    }
    case 'custom': {
      return {
        from: customFrom ?? today,
        to:   customTo   ?? today,
        preset,
      }
    }
    default:
      return { from: toISO(new Date(now.setDate(now.getDate() - 29))), to: today, preset: 'last_30_days' }
  }
}

export const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'all_time',     label: 'All Time' },
  { value: 'today',        label: 'Today' },
  { value: 'yesterday',    label: 'Yesterday' },
  { value: 'this_week',    label: 'This Week' },
  { value: 'last_week',    label: 'Last Week' },
  { value: 'last_7_days',  label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month',   label: 'This Month' },
  { value: 'last_month',   label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'last_3_months',label: 'Last 3 Months' },
  { value: 'last_6_months',label: 'Last 6 Months' },
  { value: 'this_year',    label: 'This Year' },
  { value: 'custom',       label: 'Custom Range' },
]

export function formatDateRange(range: DateRange): string {
  if (range.preset && range.preset !== 'custom') {
    const found = DATE_RANGE_PRESETS.find((p) => p.value === range.preset)
    if (found) return found.label
  }
  return `${range.from} → ${range.to}`
}

export function getDefaultDateRange(): DateRange {
  return resolveDateRange('today')
}
