import { formatProfilePhone, type ProfileRow } from '@/lib/auth/build-auth-user'

type ProfileLike = Pick<ProfileRow, 'name' | 'email' | 'phone' | 'country_code' | 'country'> | null | undefined

function metadataPhone(metadata: Record<string, unknown> | null | undefined): string | undefined {
  if (!metadata) return undefined
  for (const key of ['mobile_number', 'phone_number', 'phoneNumber', 'phone'] as const) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function formatPhoneWithCountryCode(phone: string, countryCode?: string | null): string {
  const trimmed = phone.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('+')) return trimmed
  const dial = (countryCode ?? '').replace(/\D/g, '')
  if (dial) return `+${dial} ${trimmed.replace(/\D/g, '')}`
  return trimmed
}

function resolveCountry(profile: ProfileLike, metadata: Record<string, unknown> | null | undefined): string {
  const fromProfile = profile?.country?.trim()
  if (fromProfile) return fromProfile
  const fromMeta = metadata?.country_id ?? metadata?.country ?? metadata?.countryName
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim().toUpperCase()
  return '—'
}

function resolvePhone(
  profile: ProfileLike,
  metadata: Record<string, unknown> | null | undefined,
  rechargePhone?: string | null,
): string {
  const fromProfile = formatProfilePhone(profile)
  if (fromProfile) return fromProfile

  const fromMeta = metadataPhone(metadata)
  if (fromMeta) {
    const countryCode =
      (typeof metadata?.country_code === 'string' && metadata.country_code) ||
      profile?.country_code ||
      null
    return formatPhoneWithCountryCode(fromMeta, countryCode)
  }

  const fromRecharge = rechargePhone?.trim()
  if (fromRecharge) return fromRecharge.startsWith('+') ? fromRecharge : fromRecharge

  return '—'
}

export function resolveCustomerDisplayName(input: {
  profile?: ProfileLike
  metadata?: Record<string, unknown> | null
  rechargePhone?: string | null
}): string {
  const profileName = input.profile?.name?.trim()
  if (profileName && profileName.toLowerCase() !== 'unknown' && profileName.toLowerCase() !== 'user') {
    return profileName
  }

  const phone = resolvePhone(input.profile, input.metadata ?? {}, input.rechargePhone)
  if (phone !== '—') return phone

  const email = input.profile?.email?.trim()
  if (email) return email

  return phone
}

export function resolveCustomerDisplay(input: {
  profile?: ProfileLike
  metadata?: Record<string, unknown> | null
  rechargePhone?: string | null
}): {
  name: string
  email: string
  phone: string
  country: string
} {
  const phone = resolvePhone(input.profile, input.metadata ?? {}, input.rechargePhone)
  const country = resolveCountry(input.profile, input.metadata ?? {})
  const email = input.profile?.email?.trim() || '—'

  return {
    name: resolveCustomerDisplayName(input),
    email,
    phone,
    country,
  }
}

/** Label for admin customer directory (name column). */
export function resolveAdminCustomerLabel(input: {
  name?: string | null
  email?: string | null
  phone?: string | null
  country_code?: string | null
  country?: string | null
}): string {
  return resolveCustomerDisplayName({
    profile: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      country_code: input.country_code,
      country: input.country,
    },
  })
}
