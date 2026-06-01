/** Sentinel for wildcard (stored as null in DB). */
export const ROUTING_ANY = '__ANY__'

export const ROUTING_RULE_NAME_OPTIONS = [
  { value: 'Force provider by country', label: 'Force provider by country' },
  { value: 'Force provider by operator', label: 'Force provider by operator' },
  { value: 'Force provider by product type', label: 'Force provider by product type' },
  { value: 'Force provider (full match)', label: 'Force provider (full match)' },
] as const

export const ROUTING_PRODUCT_TYPE_OPTIONS = [
  { value: ROUTING_ANY, label: 'Any product type' },
  { value: 'topup', label: 'Top-up' },
  { value: 'airtime', label: 'Airtime' },
  { value: 'data', label: 'Data' },
  { value: 'combo', label: 'Combo' },
] as const

export function toNullableRuleField(value: string): string | null {
  const t = value.trim()
  if (!t || t === ROUTING_ANY) return null
  return t
}

export function fromNullableRuleField(value: string | null | undefined): string {
  return value?.trim() ? value.trim() : ROUTING_ANY
}
