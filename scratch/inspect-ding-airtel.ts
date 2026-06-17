import fs from 'fs'
import { supabaseRest } from '../lib/db/supabase-rest'

function loadEnv() {
  const envPath = fs.existsSync('.env') ? '.env' : ''
  if (!envPath) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (!m) continue
    let v = m[2] || ''
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[m[1]] = v.trim()
  }
}

loadEnv()

async function json(path: string) {
  const res = await supabaseRest(path, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${path}: ${await res.text()}`)
  return res.json()
}

async function main() {
  const providers = (await json(
    'lcr_providers?or=(code.ilike.*ding*,name.ilike.*ding*)&select=id,code,name&limit=5',
  )) as any[]
  const provider = providers[0]
  console.log('PROVIDER', provider)
  if (!provider?.id) return

  const rawOps = (await json(
    `provider_operator_raw?service_provider_id=eq.${provider.id}&provider_operator_name=ilike.*Airtel*India*&select=id,provider_operator_name,country_code,iso_code,provider_operator_id`,
  )) as any[]
  console.log('RAW_OPS', rawOps)

  for (const rawOp of rawOps) {
    const rawPlans = (await json(
      `provider_plans_raw?provider_id=eq.${provider.id}&provider_operator_raw_id=eq.${rawOp.id}&select=id,provider_plan_name`,
    )) as any[]
    console.log('RAW_PLANS_FOR', rawOp.provider_operator_name, rawPlans.length)
  }

  const aggOps = (await json(
    `agg_operators?provider=eq.${encodeURIComponent(provider.code)}&name=ilike.*Airtel*&select=id,name,country_iso3,status,domain_classification_source,operator_domain`,
  )) as any[]
  console.log('AGG_OPS', aggOps)

  for (const op of aggOps) {
    const plans = (await json(
      `agg_plans?operator_id=eq.${op.id}&select=id,name,status,country_code`,
    )) as any[]
    console.log('AGG_PLANS', op.name, plans.length, plans.slice(0, 2))
  }

  const registry = (await json(
    'domain_operator_registry?country_iso3=eq.IND&normalized_name=eq.AIRTEL&select=operator_name,normalized_name,is_active,domain',
  )) as any[]
  console.log('REGISTRY_AIRTEL_IND', registry)

  const audit = (await json(
    `operator_domain_audit_logs?provider_code=eq.${encodeURIComponent(provider.code)}&operator_name=ilike.*Airtel*&order=created_at.desc&limit=5&select=operator_name,country_iso3,decision,rejection_reason,classification_source`,
  )) as any[]
  console.log('AUDIT', audit)

  const { hasExcludedPlanBenefits } = await import('../lib/aggregator/telecom-validator')
  const indiaOpId = rawOps.find((o) => o.provider_operator_name === 'Airtel India')?.id
  if (indiaOpId) {
    const allPlans = (await json(
      `provider_plans_raw?provider_id=eq.${provider.id}&provider_operator_raw_id=eq.${indiaOpId}&select=provider_plan_name,raw_json`,
    )) as any[]
    let excludedCount = 0
    for (const p of allPlans) {
      const ex = hasExcludedPlanBenefits(p.raw_json || {})
      if (ex.excluded) {
        excludedCount++
        console.log('EXCLUDED', p.provider_plan_name, ex.reason, JSON.stringify((p.raw_json as any)?.Benefits))
      }
    }
    console.log('EXCLUDED_TOTAL', excludedCount, 'of', allPlans.length)

    const rawOp = rawOps.find((o) => o.provider_operator_name === 'Airtel India')
    const aggIndia = (aggOps as any[]).find((o) => o.name === 'Airtel India')
    if (rawOp && aggIndia) {
      const { stringToBigInt } = await import('../lib/aggregator/agg-id-hash')
      const rawHash = stringToBigInt(rawOp.provider_operator_id)
      const aggOpRow = (await json(
        `agg_operators?id=eq.${aggIndia.id}&select=aggregator_operator_id`,
      )) as any[]
      console.log('STEP3_HASH_CHECK', {
        rawProviderOperatorId: rawOp.provider_operator_id,
        rawHash,
        aggAggregatorOperatorId: aggOpRow[0]?.aggregator_operator_id,
        hashesMatch: Number(aggOpRow[0]?.aggregator_operator_id) === rawHash,
      })

      const allRawPlans = (await json(
        `provider_plans_raw?provider_id=eq.${provider.id}&select=id,provider_plan_id,provider_operator_raw_id`,
      )) as any[]
      const linked = allRawPlans.filter((p) => p.provider_operator_raw_id === rawOp.id)
      const orphan = allRawPlans.filter((p) => p.provider_operator_raw_id !== rawOp.id && p.provider_operator_raw_id)
      console.log('RAW_PLANS_LINKED_TO_AIRTEL_INDIA', linked.length)
      console.log('RAW_PLANS_WITH_OTHER_OPERATOR', orphan.length)
    }
  }

  const syncLogs = (await json(
    `sync_logs?service_provider_id=eq.${provider.id}&stage=in.(step3_countries,step4_normalize)&order=created_at.desc&limit=4&select=stage,status,metadata,duplicate_count,normalized_count`,
  )) as any[]
  console.log('SYNC_LOGS', JSON.stringify(syncLogs, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
