import { supabaseRest } from '@/lib/db/supabase-rest'
import { validateNationalPhoneDigits } from '@/lib/country-codes'

export const PROFILE_PHONE_EXISTS_MESSAGE =
  'This contact number is already registered. Please login with your mobile phone.'

export type ParsedProfilePhone = {
  nationalNumber: string
  dialCode: string
  countryIso: string
  fullPhone: string
}

export function parseProfilePhoneFromParts(
  nationalDigits: string,
  countryCode: string,
  dialCode: string,
): { ok: true; parsed: ParsedProfilePhone } | { ok: false; error: string } {
  const validation = validateNationalPhoneDigits(nationalDigits, countryCode)
  if (!validation.valid) {
    return {
      ok: false,
      error: validation.error || 'Enter a valid mobile number for this country',
    }
  }

  const dial = dialCode.replace(/\D/g, '')
  const nationalNumber = validation.digits

  return {
    ok: true,
    parsed: {
      nationalNumber,
      dialCode: dial,
      countryIso: countryCode.trim().toUpperCase(),
      fullPhone: `+${dial}${nationalNumber}`,
    },
  }
}

export async function profilePhoneExists(
  parsed: ParsedProfilePhone,
  excludeUserId?: string,
): Promise<boolean> {
  const { nationalNumber, dialCode, fullPhone } = parsed
  const phoneFilters = [
    `and(phone.eq.${encodeURIComponent(nationalNumber)},country_code.eq.${encodeURIComponent(dialCode)})`,
    `phone.eq.${encodeURIComponent(fullPhone)}`,
    `phone.eq.${encodeURIComponent(nationalNumber)}`,
  ].join(',')

  const base = excludeUserId
    ? `profiles?and=(or(${phoneFilters}),id.neq.${encodeURIComponent(excludeUserId)})&select=id&limit=1`
    : `profiles?or=(${phoneFilters})&select=id&limit=1`

  const checkRes = await supabaseRest(base, { cache: 'no-store' }).catch(() => null)
  if (!checkRes?.ok) return false

  const rows = (await checkRes.json().catch(() => [])) as { id: string }[]
  return rows.length > 0
}
