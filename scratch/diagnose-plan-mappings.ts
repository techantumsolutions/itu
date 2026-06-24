import * as fs from 'fs'
import { supabaseRest } from '../lib/db/supabase-rest'
import { resolveProviderPricingForSystemPlan } from '../lib/catalog/resolve-provider-pricing-for-system-plan'
import { resolveSystemPlanFromInternalPlan } from '../lib/recharge-orchestration/resolve-system-plan-from-internal-plan'
import { loadAuthoritativeCandidateBundle } from '../lib/recharge-orchestration/authoritative-candidate-loader'
import { dbGetInternalPlan } from '../lib/lcr-v2/recharge-db'

function loadEnv() {
  const lines = fs.readFileSync('.env', 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (!m) continue
    let value = m[2] || ''
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    process.env[m[1]] = value.trim()
  }
}

loadEnv()

async function main() {
  const pmRes = await supabaseRest(
    'plan_mappings?select=id,service_provider_id,provider_plan_raw_id,system_plan_id,provider_plan_id,country_code,matching_score,is_verified&limit=20&order=updated_at.desc',
    { cache: 'no-store' },
  )
  const mappings = (await pmRes.json()) as Array<Record<string, unknown>>

  console.log('=== SAMPLE plan_mappings (latest 20) ===')
  for (const m of mappings) {
    const issues: string[] = []
    const pid = String(m.provider_plan_id ?? '').trim()
    if (!pid) issues.push('MISSING provider_plan_id')
    if (!m.provider_plan_raw_id) issues.push('NULL provider_plan_raw_id')
    if (!m.service_provider_id) issues.push('MISSING service_provider_id')
    if (!m.system_plan_id) issues.push('MISSING system_plan_id')
    console.log({
      id: String(m.id).slice(0, 8),
      system_plan_id: String(m.system_plan_id).slice(0, 8),
      service_provider_id: String(m.service_provider_id).slice(0, 8),
      provider_plan_id: m.provider_plan_id,
      provider_plan_raw_id: m.provider_plan_raw_id ? String(m.provider_plan_raw_id).slice(0, 8) : null,
      country_code: m.country_code,
      issues: issues.length ? issues : ['ok'],
    })
  }

  const emptyPlanId = mappings.filter((m) => !String(m.provider_plan_id ?? '').trim()).length
  console.log('\nIn sample:', emptyPlanId, 'rows with empty provider_plan_id')

  if (mappings[0]) {
    const sysId = String(mappings[0].system_plan_id)
    const spRes = await supabaseRest(
      `system_plans?id=eq.${encodeURIComponent(sysId)}&select=id,internal_plan_id,system_plan_name,status&limit=1`,
      { cache: 'no-store' },
    )
    const sp = ((await spRes.json()) as Array<Record<string, unknown>>)[0]
    console.log('\n=== system_plans for first mapping ===')
    console.log(sp)

    const auth = await resolveProviderPricingForSystemPlan(sysId)
    console.log('\n=== authoritative providers for system_plan', sysId.slice(0, 8), '===')
    console.log('count:', auth?.providers?.length ?? 0)
    for (const p of auth?.providers ?? []) {
      console.log(
        ' -',
        p.providerName,
        p.providerPlanId,
        'wholesale:',
        p.provider_wholesale_amount,
        p.provider_wholesale_currency,
      )
    }

    const checkoutPlanId = sp?.internal_plan_id ? String(sp.internal_plan_id) : sysId
    const internalExists = await dbGetInternalPlan(checkoutPlanId)
    console.log('\n=== checkout plan id check ===')
    console.log('checkout would use:', checkoutPlanId.slice(0, 8))
    console.log('exists in internal_plans:', Boolean(internalExists))

    const bundle = await loadAuthoritativeCandidateBundle(checkoutPlanId)
    console.log('routing bundle mappings:', bundle?.mappings?.length ?? 'null bundle')

    if (!sp?.internal_plan_id) {
      console.log('\n⚠ system_plans.internal_plan_id is NULL — checkout may pass system_plans.id')
      const internalBySystemId = await dbGetInternalPlan(sysId)
      console.log('dbGetInternalPlan(system_plans.id):', Boolean(internalBySystemId))
    }
  }

  const allRes = await supabaseRest('plan_mappings?select=provider_plan_id,system_plan_id&limit=1000', {
    cache: 'no-store',
  })
  const all = (await allRes.json()) as Array<{ provider_plan_id?: string | null; system_plan_id?: string }>
  const missingPid = all.filter((r) => !String(r.provider_plan_id ?? '').trim()).length

  const sysRes = await supabaseRest(
    'system_plans?select=id,internal_plan_id&limit=500',
    { cache: 'no-store' },
  )
  const systemPlans = (await sysRes.json()) as Array<{ id: string; internal_plan_id?: string | null }>
  const missingInternalLink = systemPlans.filter((s) => !s.internal_plan_id).length

  console.log('\n=== GLOBAL ===')
  console.log('plan_mappings (sample up to 1000):', all.length)
  console.log('missing provider_plan_id:', missingPid)
  console.log('system_plans without internal_plan_id:', missingInternalLink, '/', systemPlans.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
