import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type PricingQuote = {
  internalPlanId: string
  displayAmount: number
  displayCurrency: string
  providerCostAmount?: number
  providerCostCurrency?: string
  marginApplied: number
}

export async function quoteInternalPlan(input: { internalPlanId: string; currency?: string }): Promise<PricingQuote> {
  // For now: pick minimum provider_price among enabled mappings and apply margin=0.
  // This is additive and not wired into existing UI flows.
  const res = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(input.internalPlanId)}&enabled=eq.true&select=provider_price,provider_currency,margin&order=provider_price.asc&limit=1`,
    { cache: 'no-store' }
  )
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as Array<{ provider_price: number | null; provider_currency: string | null; margin: number | null }>
  const row = rows?.[0]
  const cost = typeof row?.provider_price === 'number' ? row.provider_price : 0
  const curr = row?.provider_currency ?? 'EUR'
  const margin = typeof row?.margin === 'number' ? row.margin : 0
  const displayAmount = Number((cost * (1 + margin)).toFixed(2))

  return {
    internalPlanId: input.internalPlanId,
    displayAmount,
    displayCurrency: curr,
    providerCostAmount: cost,
    providerCostCurrency: curr,
    marginApplied: margin,
  }
}

