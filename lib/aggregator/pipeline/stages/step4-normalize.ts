import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggLoadCatalogIntelligenceRegistries,
} from '@/lib/aggregator/repository'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'
import { classifyPlanDomain } from '@/lib/aggregator/catalog-intelligence/plan-domain'
import { resolvePlanServiceDomain } from '@/lib/aggregator/catalog-intelligence/segmentation'
import {
  dbUpsertAggCountries,
  dbUpsertAggOperators,
  dbUpsertAggPlans,
  dbReplaceAggPlanBenefits,
} from '@/lib/db/agg-catalog'
import * as countries from 'i18n-iso-countries'

function stringToBigInt(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return Math.abs(hash | 0)
}

export async function runStep4Normalize(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const { trustedOperators, domainRegistry, nonTelecomRegistry } = await aggLoadCatalogIntelligenceRegistries().catch(() => ({
    trustedOperators: [],
    domainRegistry: [],
    nonTelecomRegistry: [],
  }))
  const catalogEngine = new CatalogIntelligenceEngine(trustedOperators, domainRegistry, nonTelecomRegistry)

  // Clear previous staging catalog tables for this provider code
  await supabaseRest(`agg_plans?provider=eq.${config.code}`, { method: 'DELETE' })
  await supabaseRest(`agg_operators?provider=eq.${config.code}`, { method: 'DELETE' })

  // Load raw data
  const opsRes = await supabaseRest(`provider_operator_raw?service_provider_id=eq.${providerId}&select=*`, { cache: 'no-store' })
  const rawOps = await opsRes.json().catch(() => []) as any[]

  const plansRes = await supabaseRest(`provider_plans_raw?provider_id=eq.${providerId}&select=*`, { cache: 'no-store' })
  const rawPlans = await plansRes.json().catch(() => []) as any[]

  // First upsert countries to agg_countries to satisfy foreign key constraints
  const countryMap = new Map<string, { iso3: string; iso2?: string; name: string; raw_response: any }>()
  for (const op of rawOps) {
    const rawCountry = op.raw_response_json?.country || op.raw_response_json || {}
    const iso3 = String(op.iso_code || op.country_code || rawCountry.iso_code || 'UNK').toUpperCase()
    const code3 = iso3.length === 3 ? iso3 : countries.alpha2ToAlpha3(iso3) || 'UNK'
    const name = rawCountry.name || countries.getName(code3, 'en') || `Country ${code3}`
    
    if (code3 !== 'UNK') {
      countryMap.set(code3, {
        iso3: code3,
        iso2: countries.alpha3ToAlpha2(code3) || undefined,
        name,
        raw_response: rawCountry,
      })
    }
  }
  
  if (countryMap.size > 0) {
    await dbUpsertAggCountries(Array.from(countryMap.values()))
  }

  const validCountries = new Set(countryMap.keys())
  const operatorDomainByAggId = new Map<number, ReturnType<typeof catalogEngine.evaluateOperatorDomain>>()
  const operatorPlansByAggId = new Map<number, unknown[]>()

  for (const rp of rawPlans) {
    const rawOp = rawOps.find((o) => o.id === rp.provider_operator_raw_id)
    if (!rawOp) continue
    const aggOpId = stringToBigInt(rawOp.provider_operator_id)
    if (!operatorPlansByAggId.has(aggOpId)) operatorPlansByAggId.set(aggOpId, [])
    operatorPlansByAggId.get(aggOpId)!.push(rp.raw_json || {})
  }

  const opsInput = rawOps.map((op) => {
    const iso3 = String(op.iso_code || op.country_code || 'UNK').toUpperCase()
    const aggOpId = stringToBigInt(op.provider_operator_id)
    const domainEval = catalogEngine.evaluateOperatorDomain({
      operatorName: op.provider_operator_name,
      countryCode: iso3.length === 3 ? iso3 : countries.alpha2ToAlpha3(iso3) || iso3,
      rawPlans: operatorPlansByAggId.get(aggOpId) || [],
    })
    operatorDomainByAggId.set(aggOpId, domainEval)
    return {
      provider: config.code as any,
      aggregator_operator_id: aggOpId,
      country_iso3: iso3.length === 3 ? iso3 : countries.alpha2ToAlpha3(iso3) || 'UNK',
      name: op.provider_operator_name,
      regions: [],
      raw_response: op.raw_response_json,
      service_domain: domainEval.domain,
      service_domain_confidence: domainEval.confidence,
      service_domain_source: domainEval.classificationSource,
      operator_domain: domainEval.domain,
      operator_domain_confidence: domainEval.confidence,
      domain_classification_source: domainEval.classificationSource,
    }
  }).filter((o) => validCountries.has(o.country_iso3))

  const upsertedOps = await dbUpsertAggOperators(opsInput)
  const opIdMap = new Map<number, string>()
  for (const row of upsertedOps ?? []) {
    opIdMap.set(Number(row.aggregator_operator_id), row.id)
  }

  let plansUpserted = 0
  const plansInput = rawPlans.map((rp) => {
    // Find matching raw operator to get aggregator_operator_id
    const rawOp = rawOps.find((o) => o.id === rp.provider_operator_raw_id)
    if (!rawOp) return null

    const aggOpId = stringToBigInt(rawOp.provider_operator_id)
    const dbOpUuid = opIdMap.get(aggOpId)
    if (!dbOpUuid) return null
    const domainEval = operatorDomainByAggId.get(aggOpId)
    const planDomainEval = classifyPlanDomain(rp.raw_json || {}, rawOp.provider_operator_name)
    const segment = domainEval
      ? resolvePlanServiceDomain({ operatorEvaluation: domainEval, planEvaluation: planDomainEval })
      : null

    return {
      provider: config.code as any,
      aggregator_plan_id: stringToBigInt(rp.provider_plan_id),
      operator_id: dbOpUuid,
      type: rp.plan_type || 'UNKNOWN',
      name: rp.provider_plan_name || 'Plan',
      description: rp.description,
      retail_amount: rp.amount ? Number(rp.amount) : null,
      currency_unit: rp.currency,
      raw_response: rp.raw_json,
      service_domain: segment?.serviceDomain ?? domainEval?.domain ?? 'UNKNOWN',
      service_domain_confidence: segment?.confidence ?? domainEval?.confidence ?? 0,
      service_domain_source: segment?.source ?? domainEval?.classificationSource ?? 'unknown',
    }
  }).filter(Boolean) as any[]

  const upsertedPlans = await dbUpsertAggPlans(plansInput)
  const planIdByAggId = new Map<number, string>()
  for (const row of upsertedPlans ?? []) {
    planIdByAggId.set(Number(row.aggregator_plan_id), row.id)
  }

  // Add benefits
  for (const rp of rawPlans) {
    const planDbId = planIdByAggId.get(stringToBigInt(rp.provider_plan_id))
    if (!planDbId) continue

    const rawBenefits = Array.isArray(rp.benefits_json) ? rp.benefits_json : []
    const benefits = rawBenefits.map((b: any) => ({
      type: String(b?.type || b?.benefitType || '').toUpperCase() || 'OTHER',
      amount_base: Number(b?.amountBase || b?.amount?.base || b?.value || 0),
      unit: String(b?.unit || ''),
      additional_information: String(b?.additionalInformation || b?.additional_information || ''),
      raw_response: b,
    }))

    try {
      await dbReplaceAggPlanBenefits(planDbId, benefits)
    } catch {}
    plansUpserted++
  }

  return {
    success: true,
    message: `Staging normalization complete. Loaded ${opsInput.length} operators and ${plansUpserted} plans into agg staging tables.`,
    data: {
      operatorsNormalized: opsInput.length,
      plansNormalized: plansUpserted,
    },
  }
}
