export type AdminTransactionDateRange = {
  start: Date | null
  end: Date | null
}

function localDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function localDayEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

/** Monday 00:00:00 of the week containing `date` (Mon–Sun week). */
function startOfWeekMonday(date: Date): Date {
  const d = localDayStart(date)
  const day = d.getDay()
  const daysFromMonday = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - daysFromMonday)
  return d
}

/** Sunday 23:59:59.999 of the week containing `date`. */
function endOfWeekSunday(date: Date): Date {
  const monday = startOfWeekMonday(date)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return localDayEnd(sunday)
}

/** Resolve calendar date ranges for admin transaction filters. */
export function resolveAdminTransactionDateRange(filter: string | undefined): AdminTransactionDateRange {
  const key = (filter ?? 'all').trim().toLowerCase()
  if (!key || key === 'all') {
    return { start: null, end: null }
  }

  const now = new Date()

  if (key === 'today') {
    return { start: localDayStart(now), end: localDayEnd(now) }
  }

  if (key === 'week') {
    return { start: startOfWeekMonday(now), end: endOfWeekSunday(now) }
  }

  if (key === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    return { start, end }
  }

  if (key === 'year') {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    return { start, end }
  }

  return { start: null, end: null }
}
