import { isSupabaseCatalogConfigured } from '@/lib/db/supabase-rest'
import { dbFetchCountries } from '@/lib/db/catalog'

/**
 * Build international subscriber digits (no "+") for lookups.
 * Requires catalog countries in Supabase with dial_prefix.
 */
export async function internationalAccountDigits(countryIso: string, localPhone: string): Promise<string | null> {
  const digits = localPhone.replace(/\D/g, '')
  if (!digits || !isSupabaseCatalogConfigured()) return null
  const countries = await dbFetchCountries()
  const row = countries.find(
    (x) =>
      x.iso2.toUpperCase() === countryIso.toUpperCase() ||
      x.iso3.toUpperCase() === countryIso.toUpperCase(),
  )
  const prefixRaw = row?.dial_prefix ?? ''
  const cc = prefixRaw.replace(/\D/g, '')
  if (!cc) return null
  return `${cc}${digits}`
}
