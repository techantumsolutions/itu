import { getConnector } from '@/lib/providers/registry'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggUpsertRawOperator, aggUpsertRawPlan } from '@/lib/aggregator/repository'
import { sha256 } from '@/lib/aggregator/signature'
import { resolveSyncCountries, type SyncCatalogOptions } from '@/lib/lcr/sync-options'
import { resolvePlanCountryCode } from '@/lib/aggregator/plan-country-resolver'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'
import { wholesaleCostFromNormalizedPlan } from '@/lib/catalog/provider-wholesale-pricing'

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
  syncRunId?: string | null,
  options?: SyncCatalogOptions
): Promise<{ success: boolean; message: string; data?: any }> {
  const connector = getConnector(config.adapterKey)
  const countries = resolveSyncCountries(config, options)
  const raw = await connector.fetchRawPlans(config, { countries })
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
    const opMeta = rawOperatorFromPlan(plan)
    const opId = opMeta.providerOperatorId
    const dbOpId = opIdMap.get(opId)
    if (!dbOpId) continue

    const operatorCountryIso3 = normalizeCountryIso3(opMeta.countryCode || plan.countryIso3 || '')
    const countryCode = resolvePlanCountryCode({
      planName: plan.name,
      planDescription: plan.description,
      rawPlan: plan.raw,
      operatorCountryIso3,
    })

    const wholesale = wholesaleCostFromNormalizedPlan(plan)

    const rawPlan = await aggUpsertRawPlan({
      providerId,
      providerPlanId: plan.providerPlanId,
      providerOperatorRawId: dbOpId,
      providerPlanName: plan.name ?? null,
      providerPlanCode: plan.providerPlanId,
      amount: wholesale.wholesaleAmount,
      currency: wholesale.wholesaleCurrency,
      destinationAmount: wholesale.destinationAmount,
      destinationCurrency: wholesale.destinationCurrency,
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
      countryCode,
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
