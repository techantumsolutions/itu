import { isSupabaseCatalogConfigured, supabaseRest } from '@/lib/db/supabase-rest'
import { findMissingSeedCoverage } from '@/lib/aggregator/country-seed-source'

export const COUNTRIES_INCOMPLETE_ERROR = `Countries table is incomplete.

Run:

npm run db:seed-countries`

function isDatabaseUnreachableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const cause = (error as Error & { cause?: { code?: string } }).cause
  return (
    error.message.includes('fetch failed') ||
    cause?.code === 'ECONNREFUSED' ||
    cause?.code === 'ENOTFOUND'
  )
}

/**
 * Fail fast when the countries table is empty or missing entries from country-calling-code.
 * Does not auto-seed.
 */
export async function validateCountriesTable(): Promise<void> {
  if (!isSupabaseCatalogConfigured()) return

  let res: Response
  try {
    res = await supabaseRest('countries?select=id,iso2,iso3&limit=1000', { cache: 'no-store' })
  } catch (error) {
    if (isDatabaseUnreachableError(error) && process.env.NODE_ENV === 'development') {
      console.warn(
        '[countries] Database unreachable during startup validation. ' +
          'Dev server will continue — start Supabase and run `npm run db:seed-countries` before provider sync.',
      )
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Cannot reach Supabase for countries validation. Ensure SUPABASE_URL is correct and the database is running.\n\n${message}`,
    )
  }

  if (!res.ok) {
    throw new Error(`Failed to validate countries table: ${await res.text()}`)
  }

  const rows = (await res.json()) as Array<{ id: string; iso2: string; iso3: string }>
  const missing = findMissingSeedCoverage(rows)
  if (missing.length > 0) {
    const preview = missing
      .slice(0, 5)
      .map((record) => `${record.iso3}/${record.iso2}`)
      .join(', ')
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[countries] ${missing.length} canonical countries missing (e.g. ${preview}). ` +
          'Dev server will continue — run `npm run db:seed-countries` before provider sync.',
      )
      return
    }
    throw new Error(
      `${COUNTRIES_INCOMPLETE_ERROR}\n\nMissing ${missing.length} canonical countries (e.g. ${preview}).`,
    )
  }
}
