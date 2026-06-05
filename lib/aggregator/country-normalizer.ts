import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { DIAL_CODES } from '@/lib/lcr/countries'

// Register english locale for country names
countries.registerLocale(enLocale)

export type NormalizedCountryResult = {
  canonicalName: string
  iso2: string
  iso3: string
}

export type CountryDbRow = {
  id: string
  name: string
  iso2: string
  iso3: string
  dial_prefix: string
  min_length: number
  max_length: number
}

/**
 * Normalizes input country parameters into a canonical name, ISO2, and ISO3 codes.
 */
export function normalizeCountry(input: {
  countryName?: string | null
  iso2?: string | null
  iso3?: string | null
}): NormalizedCountryResult | null {
  let a2 = (input.iso2 ?? '').trim().toUpperCase()
  let a3 = (input.iso3 ?? '').trim().toUpperCase()
  const name = (input.countryName ?? '').trim()

  // 1. Resolve using ISO2 if valid
  if (a2 && a2.length === 2 && countries.isValid(a2)) {
    a3 = countries.alpha2ToAlpha3(a2) || a3
  }
  // 2. Resolve using ISO3 if valid
  else if (a3 && a3.length === 3 && countries.isValid(a3)) {
    a2 = countries.alpha3ToAlpha2(a3) || a2
  }
  // 3. Resolve using country name if codes are missing/invalid
  else if (name) {
    const lookup2 = countries.getAlpha2Code(name, 'en')
    if (lookup2) {
      a2 = lookup2
      a3 = countries.alpha2ToAlpha3(a2) || a3
    } else {
      const lookup3 = countries.getAlpha3Code(name, 'en')
      if (lookup3) {
        a3 = lookup3
        a2 = countries.alpha3ToAlpha2(a3) || a2
      }
    }
  }

  // Double check validity of resolved codes
  if (a2 && a3 && countries.isValid(a2) && countries.isValid(a3)) {
    const canonicalName = countries.getName(a2, 'en') || name
    return {
      canonicalName,
      iso2: a2,
      iso3: a3,
    }
  }

  // Fallback for cases like UNK or custom strings
  if (a3 && a3.length === 3) {
    return {
      canonicalName: name || `Country ${a3}`,
      iso2: a2 || a3.slice(0, 2),
      iso3: a3,
    }
  }
  if (a2 && a2.length === 2) {
    return {
      canonicalName: name || `Country ${a2}`,
      iso2: a2,
      iso3: a3 || `${a2}X`,
    }
  }

  return null
}

/**
 * Normalizes input country properties, looks it up, and upserts it in the canonical countries table.
 */
export async function getOrCreateCanonicalCountry(input: {
  countryName?: string | null
  iso2?: string | null
  iso3?: string | null
}): Promise<CountryDbRow | null> {
  const norm = normalizeCountry(input)
  if (!norm) return null

  const id = norm.iso3

  // Try retrieving existing canonical record from cache/db
  const getRes = await supabaseRest(`countries?id=eq.${id}&limit=1`, { cache: 'no-store' })
  if (getRes.ok) {
    const rows = await getRes.json().catch(() => []) as CountryDbRow[]
    if (rows.length > 0) return rows[0]!
  }

  // Try creating/upserting the canonical country
  const dialPrefix = DIAL_CODES[norm.iso3] || DIAL_CODES[norm.iso2] || ''
  
  const upsertRes = await supabaseRest('countries', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      id,
      name: norm.canonicalName,
      iso2: norm.iso2,
      iso3: norm.iso3,
      dial_prefix: dialPrefix,
      min_length: 10,
      max_length: 15,
    }),
  })

  if (!upsertRes.ok) {
    console.error(`Failed to upsert country: ${norm.canonicalName} (${id})`, await upsertRes.text())
    return null
  }

  const rows = await upsertRes.json().catch(() => []) as CountryDbRow[]
  return rows[0] || null
}
