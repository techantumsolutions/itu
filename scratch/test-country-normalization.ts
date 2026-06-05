import { normalizeCountry } from '../lib/aggregator/country-normalizer'

const testCases = [
  { iso2: 'MX' },
  { iso3: 'MEX' },
  { countryName: 'Mexico' },
  { iso2: 'US' },
  { iso3: 'USA' },
  { countryName: 'United States' },
  { countryName: 'Afghanistan' },
  { iso2: 'AF' },
  { iso3: 'AFG' },
  { countryName: 'India' },
  { iso2: 'IN' },
  { iso3: 'IND' },
  { countryName: 'InvalidCountryName' }, // should fall back or return null
]

console.log('--- TESTING COUNTRY NORMALIZATION ---')
for (const tc of testCases) {
  const result = normalizeCountry(tc)
  console.log(`Input: ${JSON.stringify(tc)}`)
  console.log(`Result: ${JSON.stringify(result)}\n`)
}
