import { getConnector } from '@/lib/providers/registry'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggUpsertRawOperator, aggUpsertRawPlan } from '@/lib/aggregator/repository'
import { sha256 } from '@/lib/aggregator/signature'

function rawOperatorFromPlan(plan: any) {
  const raw: any = plan.raw ?? {}
  const operator = raw?.operator ?? {}
  const country = operator?.country ?? {}
  const providerOperatorId = String(operator?.id || plan.operatorRef || '')
  const providerOperatorName = String(operator?.name || plan.operatorName || plan.operatorRef || '')
  return {
    providerOperatorId,
    providerOperatorName,
    countryCode: String(country?.iso_code || plan.countryIso3 || '').toUpperCase(),
    isoCode: String(country?.iso_code || plan.countryIso3 || '').toUpperCase(),
    mobileCountryCode: String(country?.mobile_country_code || country?.mcc || '') || null,
    logo: String(operator?.logo || operator?.logo_url || '') || null,
    operatorType: String(operator?.type || plan.service || 'Mobile'),
    currency: String(raw?.prices?.retail?.unit || plan.retailCurrency || '') || null,
    rawResponseJson: operator && Object.keys(operator).length ? operator : { operatorRef: plan.operatorRef, operatorName: plan.operatorName },
  }
}

export async function runStep2Fetch(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const connector = getConnector(config.adapterKey)
  const raw = await connector.fetchRawPlans(config, { countries: config.supportedCountries })
  const normalized = await connector.normalizePlans({ config, raw })

  // Clear existing raw plans/operators first
  await supabaseRest(`provider_plans_raw?provider_id=eq.${providerId}`, { method: 'DELETE' })
  await supabaseRest(`provider_operator_raw?service_provider_id=eq.${providerId}`, { method: 'DELETE' })

  const opIdMap = new Map<string, string>()
  let opsStored = 0
  let plansStored = 0

  // Store raw operators
  for (const plan of normalized) {
    const op = rawOperatorFromPlan(plan)
    if (!op.providerOperatorId) continue

    if (!opIdMap.has(op.providerOperatorId)) {
      const rawOp = await aggUpsertRawOperator({
        serviceProviderId: providerId,
        ...op,
        checksumHash: sha256(JSON.stringify(op.rawResponseJson)),
      })
      if (rawOp?.id) {
        opIdMap.set(op.providerOperatorId, rawOp.id)
        opsStored++
      }
    }
  }

  // Store raw plans
  for (const plan of normalized) {
    const opId = rawOperatorFromPlan(plan).providerOperatorId
    const dbOpId = opIdMap.get(opId)
    if (!dbOpId) continue

    const rawPlan = await aggUpsertRawPlan({
      providerId,
      providerPlanId: plan.providerPlanId,
      providerOperatorRawId: dbOpId,
      providerPlanName: plan.name ?? null,
      providerPlanCode: plan.providerPlanId,
      amount: plan.retailAmount ?? plan.destinationAmount ?? null,
      currency: plan.retailCurrency ?? null,
      validity: plan.validityDays ? `${plan.validityDays}D` : null,
      talktime: null,
      dataVolume: null,
      sms: null,
      description: plan.description ?? null,
      planType: plan.planType ?? null,
      benefitsJson: plan.benefits,
      rawJson: plan.raw,
      checksumHash: sha256(JSON.stringify(plan.raw)),
      status: 'active',
    })
    if (rawPlan?.id) {
      plansStored++
    }
  }

  return {
    success: true,
    message: `Stored raw data in DB. Stored ${opsStored} raw operators and ${plansStored} raw plans.`,
    data: {
      fetchedRaw: raw.length,
      rawOperators: opsStored,
      rawPlans: plansStored,
    },
  }
}
