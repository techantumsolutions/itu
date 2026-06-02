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

// Build countries list using libphonenumber-js
const rawList = getCountries()
  .map((country) => {
    try {
      const dialCode = getCountryCallingCode(country)
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
