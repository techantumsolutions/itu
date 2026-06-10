import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js'

export const isValidPhoneNumber = (phone: string, countryCode: string): boolean => {
  try {
    const phoneNumber = parsePhoneNumberFromString(phone, countryCode as CountryCode)
    return phoneNumber ? phoneNumber.isValid() : false
  } catch {
    return false
  }
}

export const getFlagEmoji = (countryCode: string) => {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

export const getCountryName = (code: string) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

export interface CountryItem {
  code: string
  dialCode: string
  flag: string
  name: string
}

const NANP_EXCEPTIONS: Record<string, string> = {
  AS: '1-684', // American Samoa
  AI: '1-264', // Anguilla
  AG: '1-268', // Antigua and Barbuda
  BS: '1-242', // Bahamas
  BB: '1-246', // Barbados
  BM: '1-441', // Bermuda
  VG: '1-284', // British Virgin Islands
  KY: '1-345', // Cayman Islands
  DM: '1-767', // Dominica
  DO: '1-809', // Dominican Republic
  GD: '1-473', // Grenada
  GU: '1-671', // Guam
  JM: '1-876', // Jamaica
  MS: '1-664', // Montserrat
  MP: '1-670', // Northern Mariana Islands
  PR: '1-787', // Puerto Rico
  KN: '1-869', // Saint Kitts and Nevis
  LC: '1-758', // Saint Lucia
  VC: '1-784', // Saint Vincent and the Grenadines
  SX: '1-721', // Sint Maarten
  TT: '1-868', // Trinidad and Tobago
  TC: '1-649', // Turks and Caicos Islands
  VI: '1-340', // United States Virgin Islands
}

// Build countries list using libphonenumber-js
const rawList = getCountries()
  .map((country) => {
    try {
      const codeUpper = country.toUpperCase()
      const dialCode = NANP_EXCEPTIONS[codeUpper] || getCountryCallingCode(country)
      return {
        code: country as string,
        dialCode: dialCode as string,
        flag: getFlagEmoji(country),
        name: getCountryName(country),
      }
    } catch {
      return null
    }
  })

export const countriesList: CountryItem[] = rawList
  .filter((c): c is CountryItem => c !== null)
  .sort((a, b) => a.name.localeCompare(b.name))

