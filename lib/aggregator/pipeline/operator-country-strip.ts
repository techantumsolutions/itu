import * as countries from 'i18n-iso-countries'
import {
  COUNTRY_TOKENS,
  normalizeOperatorForRegistry,
} from '@/lib/aggregator/catalog-intelligence/brand-intelligence'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeWhitespace(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function buildCountryStripTokens(
  countryIso3: string,
  countryName?: string | null,
): string[] {
  const iso3 = countryIso3.trim().toUpperCase()
  const iso2 = countries.alpha3ToAlpha2(iso3)?.toUpperCase() ?? ''
  const tokens = new Set<string>()

  if (iso3) tokens.add(iso3)
  if (iso2) tokens.add(iso2)

  const englishName = countryName?.trim() || countries.getName(iso3, 'en') || ''
  if (englishName) {
    tokens.add(englishName.toUpperCase())
    for (const word of englishName.split(/\s+/)) {
      if (word.length >= 2) tokens.add(word.toUpperCase())
    }
  }

  for (const token of COUNTRY_TOKENS) {
    if (token === iso3 || token === iso2) {
      tokens.add(token)
      continue
    }
    if (englishName && englishName.toUpperCase().includes(token)) {
      tokens.add(token)
    }
  }

  return [...tokens]
    .filter((token) => token.length >= 2)
    .sort((a, b) => b.length - a.length)
}

/**
 * Remove country name / ISO2 / ISO3 tokens when they appear as a prefix or suffix.
 */
export function stripOperatorCountryAffixes(
  operatorName: string,
  countryIso3: string,
  countryName?: string | null,
): string {
  const original = normalizeWhitespace(operatorName)
  if (!original) return original

  const tokens = buildCountryStripTokens(countryIso3, countryName)
  let result = original
  let changed = true

  while (changed) {
    changed = false
    for (const token of tokens) {
      const prefix = new RegExp(`^${escapeRegExp(token)}\\s+`, 'i')
      const suffix = new RegExp(`\\s+${escapeRegExp(token)}$`, 'i')
      if (prefix.test(result)) {
        result = result.replace(prefix, '').trim()
        changed = true
      }
      if (suffix.test(result)) {
        result = result.replace(suffix, '').trim()
        changed = true
      }
    }
  }

  return result || original
}

/** Operator name used for registry / catalog domain filtration. */
export function operatorNameForFiltration(
  operatorName: string,
  countryIso3: string,
  countryName?: string | null,
): string {
  return stripOperatorCountryAffixes(operatorName, countryIso3, countryName)
}

/** Stable merge key for operators in the same country after country affix stripping. */
export function operatorMergeKey(
  operatorName: string,
  countryIso3: string,
  countryName?: string | null,
): string {
  return normalizeOperatorForRegistry(
    operatorNameForFiltration(operatorName, countryIso3, countryName),
  )
}
