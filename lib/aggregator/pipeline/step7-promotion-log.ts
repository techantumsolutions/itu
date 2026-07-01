export type Step7PromotionLogContext = {
  providerId?: string
  providerName?: string
  providerCode?: string
  providerOperatorId?: string | null
  providerOperatorName?: string | null
  country?: string | null
  countryCode?: string | null
  systemOperatorId?: string | null
  systemOperatorName?: string | null
  providerPlanId?: string | null
  systemPlanId?: string | null
  operation: 'INSERT' | 'UPDATE' | 'UPSERT' | 'SKIP' | 'PATCH'
  entity?: 'operator' | 'plan' | 'plan_mapping' | 'operator_mapping'
  reason?: string
  error?: string
}

export function logStep7Promotion(ctx: Step7PromotionLogContext): void {
  const parts = [
    '[Step7]',
    ctx.entity ? `entity=${ctx.entity}` : null,
    `operation=${ctx.operation}`,
    ctx.providerId ? `providerId=${ctx.providerId}` : null,
    ctx.providerName ? `providerName=${ctx.providerName}` : null,
    ctx.providerCode ? `providerCode=${ctx.providerCode}` : null,
    ctx.providerOperatorId ? `providerOperatorId=${ctx.providerOperatorId}` : null,
    ctx.providerOperatorName ? `providerOperatorName=${ctx.providerOperatorName}` : null,
    ctx.country ? `country=${ctx.country}` : null,
    ctx.countryCode ? `countryCode=${ctx.countryCode}` : null,
    ctx.systemOperatorId ? `systemOperatorId=${ctx.systemOperatorId}` : null,
    ctx.systemOperatorName ? `systemOperatorName=${ctx.systemOperatorName}` : null,
    ctx.providerPlanId ? `providerPlanId=${ctx.providerPlanId}` : null,
    ctx.systemPlanId ? `systemPlanId=${ctx.systemPlanId}` : null,
    ctx.reason ? `reason=${ctx.reason}` : null,
    ctx.error ? `error=${ctx.error}` : null,
  ].filter(Boolean)

  if (ctx.operation === 'SKIP' || ctx.error) {
    console.warn(parts.join(' '))
  } else {
    console.log(parts.join(' '))
  }
}

export function validateSystemOperatorPromotionInput(input: {
  systemOperatorName?: string | null
  slug?: string | null
  countryId?: string | null
}): { ok: true; name: string; slug: string; countryId: string } | { ok: false; missing: string[]; reason: string } {
  const name = String(input.systemOperatorName ?? '').trim()
  const slug = String(input.slug ?? '').trim()
  const countryId = String(input.countryId ?? '').trim().toUpperCase()
  const missing: string[] = []

  if (!name) missing.push('system_operator_name')
  if (!slug) missing.push('slug')
  if (!countryId) missing.push('country_id')

  if (missing.length) {
    return {
      ok: false,
      missing,
      reason: `Missing required operator field(s): ${missing.join(', ')}`,
    }
  }

  return { ok: true, name, slug, countryId }
}
