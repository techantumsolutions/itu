import codes from 'country-calling-code'

export type CountrySeedRecord = {
  id: string
  iso2: string
  iso3: string
  name: string
  dial_prefix: string
}

function formatDialPrefix(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`
}

/**
 * Build canonical country seed records from country-calling-code.
 * Used only for one-time seeding and startup validation — never during provider sync.
 */
export function buildCountrySeedRecords(): CountrySeedRecord[] {
  const byIso3 = new Map<string, CountrySeedRecord>()

  for (const entry of codes) {
    const iso2 = (entry.isoCode2 ?? '').trim().toUpperCase()
    const iso3 = (entry.isoCode3 ?? '').trim().toUpperCase()
    const name = (entry.country ?? '').trim()
    const dial_prefix = formatDialPrefix(entry.countryCodes?.[0] ?? '')

    if (iso2.length !== 2 || iso3.length !== 3 || !name || !dial_prefix) {
      continue
    }

    if (!byIso3.has(iso3)) {
      byIso3.set(iso3, { id: iso3, iso2, iso3, name, dial_prefix })
    }
  }

  return Array.from(byIso3.values())
}

export function getExpectedCountryCount(): number {
  return buildCountrySeedRecords().length
}

type CountryCoverageRow = { id: string; iso2: string; iso3: string }

/**
 * Returns seed records not yet represented in the database by canonical id, iso3, or iso2.
 */
export function findMissingSeedCoverage(rows: CountryCoverageRow[]): CountrySeedRecord[] {
  const idSet = new Set(rows.map((row) => row.id.trim().toUpperCase()))
  const iso3Set = new Set(rows.map((row) => row.iso3.trim().toUpperCase()))
  const iso2Set = new Set(rows.map((row) => row.iso2.trim().toUpperCase()))

  return buildCountrySeedRecords().filter(
    (record) =>
      !idSet.has(record.iso3) && !iso3Set.has(record.iso3) && !iso2Set.has(record.iso2),
  )
}

export function getMissingSeedCoverageCount(rows: CountryCoverageRow[]): number {
  return findMissingSeedCoverage(rows).length
}
