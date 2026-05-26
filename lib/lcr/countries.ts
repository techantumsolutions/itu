/** ISO 3166-1 alpha-2 ↔ alpha-3 for public catalog APIs. */
export const ISO2_TO_ISO3: Record<string, string> = {
  IN: 'IND',
  US: 'USA',
  GB: 'GBR',
  NG: 'NGA',
  GH: 'GHA',
  KE: 'KEN',
  JM: 'JAM',
  HT: 'HTI',
  MX: 'MEX',
  PH: 'PHL',
  PK: 'PAK',
  BD: 'BGD',
  LK: 'LKA',
  NP: 'NPL',
  AE: 'ARE',
  SA: 'SAU',
  BR: 'BRA',
  CO: 'COL',
  CA: 'CAN',
  AU: 'AUS',
  DE: 'DEU',
  FR: 'FRA',
  IT: 'ITA',
  ES: 'ESP',
  ZA: 'ZAF',
  EG: 'EGY',
  TR: 'TUR',
  ID: 'IDN',
  MY: 'MYS',
  SG: 'SGP',
  TH: 'THA',
  VN: 'VNM',
}

export const ISO3_TO_ISO2: Record<string, string> = Object.fromEntries(
  Object.entries(ISO2_TO_ISO3).map(([a2, a3]) => [a3, a2]),
)

export const COUNTRY_NAMES: Record<string, string> = {
  IND: 'India',
  USA: 'United States',
  GBR: 'United Kingdom',
  NGA: 'Nigeria',
  GHA: 'Ghana',
  KEN: 'Kenya',
  JAM: 'Jamaica',
  HTI: 'Haiti',
  MEX: 'Mexico',
  PHL: 'Philippines',
  PAK: 'Pakistan',
  BGD: 'Bangladesh',
  LKA: 'Sri Lanka',
  NPL: 'Nepal',
  ARE: 'United Arab Emirates',
  SAU: 'Saudi Arabia',
  BRA: 'Brazil',
  COL: 'Colombia',
  CAN: 'Canada',
  AUS: 'Australia',
  DEU: 'Germany',
  FRA: 'France',
  ITA: 'Italy',
  ESP: 'Spain',
  ZAF: 'South Africa',
  EGY: 'Egypt',
  TUR: 'Turkey',
  IDN: 'Indonesia',
  MYS: 'Malaysia',
  SGP: 'Singapore',
  THA: 'Thailand',
  VNM: 'Vietnam',
}

export const DIAL_CODES: Record<string, string> = {
  IND: '+91',
  USA: '+1',
  GBR: '+44',
  NGA: '+234',
  GHA: '+233',
  KEN: '+254',
  JAM: '+1',
  HTI: '+509',
  MEX: '+52',
  PHL: '+63',
  PAK: '+92',
  BGD: '+880',
  BRA: '+55',
  COL: '+57',
}

/** Normalize user input to ISO 3166-1 alpha-3 (uppercase). Accepts alpha-2 or alpha-3. */
export function normalizeCountryIso3(input: string): string {
  const t = input.trim().toUpperCase()
  if (!t) return ''
  if (t.length === 2) return ISO2_TO_ISO3[t] ?? t
  return t
}

/** Public APIs often use ISO2; synced catalog stores ISO3. */
export function toPublicCountryCode(iso3: string): string {
  const u = iso3.trim().toUpperCase()
  return ISO3_TO_ISO2[u] ?? u
}

export function countryDisplayName(iso3: string, fallback?: string): string {
  const u = iso3.trim().toUpperCase()
  return COUNTRY_NAMES[u] ?? fallback ?? u
}

export function flagEmojiFromIso(iso: string): string {
  const iso2 = iso.length === 2 ? iso.toUpperCase() : (ISO3_TO_ISO2[iso.toUpperCase()] ?? '')
  if (iso2.length !== 2) return '🌍'
  const codePoints = iso2.split('').map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

export function normalizeCountryList(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []
  const parts = Array.isArray(raw) ? raw : raw.split(/[\s,;]+/)
  const out = new Set<string>()
  for (const part of parts) {
    const iso = normalizeCountryIso3(part)
    if (iso) out.add(iso)
  }
  return [...out]
}
