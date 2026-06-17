import countries from 'i18n-iso-countries'
import enLocale from 'i18n-iso-countries/langs/en.json'

countries.registerLocale(enLocale)

export type NormalizedCountryResult = {
  canonicalName: string
  iso2: string
  iso3: string
}

/**
 * Normalizes provider country input into canonical English name and ISO codes.
 * Does not query or modify the database.
 */
export function normalizeCountry(input: {
  countryName?: string | null
  iso2?: string | null
  iso3?: string | null
}): NormalizedCountryResult | null {
  let a2 = (input.iso2 ?? '').trim().toUpperCase()
  let a3 = (input.iso3 ?? '').trim().toUpperCase()
  const name = (input.countryName ?? '').trim()

  if (a2 && a2.length === 2 && countries.isValid(a2)) {
    a3 = countries.alpha2ToAlpha3(a2) || a3
  } else if (a3 && a3.length === 3 && countries.isValid(a3)) {
    a2 = countries.alpha3ToAlpha2(a3) || a2
  } else if (name) {
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

  if (a2 && a3 && countries.isValid(a2) && countries.isValid(a3)) {
    const canonicalName = countries.getName(a2, 'en') || name
    return {
      canonicalName,
      iso2: a2,
      iso3: a3,
    }
  }

  return null
}
