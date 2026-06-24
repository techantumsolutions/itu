import * as fs from 'fs'
import { supabaseRest } from '../lib/db/supabase-rest'
import { resolveProviderPricingForSystemPlan } from '../lib/catalog/resolve-provider-pricing-for-system-plan'
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

async function diagnoseSystemPlan(systemPlanId: string) {
  console.log('\n========================================')
  console.log('SYSTEM PLAN:', systemPlanId)

  const spRes = await supabaseRest(
    `system_plans?id=eq.${encodeURIComponent(systemPlanId)}&select=id,internal_plan_id,system_plan_name,status,amount,currency&limit=1`,
    { cache: 'no-store' },
  )
  const sp = ((await spRes.json()) as Array<Record<string, unknown>>)[0]
  console.log('system_plans row:', sp)

  const mapRes = await supabaseRest(
    `plan_mappings?system_plan_id=eq.${encodeURIComponent(systemPlanId)}&select=id,service_provider_id,provider_plan_id,provider_plan_raw_id,country_code`,
    { cache: 'no-store' },
  )
  const mappings = (await mapRes.json()) as Array<Record<string, unknown>>
  console.log('plan_mappings rows:', mappings.length)
  for (const m of mappings) {
    console.log('  -', m.provider_plan_id, '| provider:', String(m.service_provider_id).slice(0, 8), '| raw:', m.provider_plan_raw_id ? String(m.provider_plan_raw_id).slice(0, 8) : 'NULL')
  }

  const auth = await resolveProviderPricingForSystemPlan(systemPlanId)
  console.log('authoritative provider count:', auth?.providers.length ?? 0)

  const internalId = sp?.internal_plan_id ? String(sp.internal_plan_id) : null
  if (internalId) {
    const exists = await dbGetInternalPlan(internalId)
    console.log('internal_plans row exists:', Boolean(exists))
    const bundle = await loadAuthoritativeCandidateBundle(internalId)
    console.log('routing bundle mappings:', bundle?.mappings.length ?? 'NULL')
  } else {
    console.log('⚠ NO internal_plan_id — routing will fail dbGetInternalPlan if checkout uses system id')
    const exists = await dbGetInternalPlan(systemPlanId)
    console.log('dbGetInternalPlan(system_plans.id):', Boolean(exists))
  }
}

async function main() {
  // India plan from sample
  await diagnoseSystemPlan('05886844-0000-0000-0000-000000000000'.replace(/0{8}-0000/, ''))
  
  // Find IND plans with mappings
  const indRes = await supabaseRest(
    "plan_mappings?country_code=eq.IND&select=system_plan_id&limit=5",
    { cache: 'no-store' },
  )
  const indRows = (await indRes.json()) as Array<{ system_plan_id: string }>
  const unique = [...new Set(indRows.map((r) => r.system_plan_id))]
  console.log('\n=== IND plan_mappings sample system_plan_ids ===', unique.map((id) => id.slice(0, 8)))

  for (const id of unique.slice(0, 3)) {
    await diagnoseSystemPlan(id)
  }

  // Recent routing logs with NO_PROVIDER_MAPPING
  const logRes = await supabaseRest(
    'routing_logs?execution_result=eq.NO_PROVIDER_MAPPING&select=transaction_id,product_id,execution_result,created_at&order=created_at.desc&limit=5',
    { cache: 'no-store' },
  ).catch(() => null)
  if (logRes?.ok) {
    const logs = await logRes.json()
    console.log('\n=== Recent NO_PROVIDER_MAPPING routing logs ===')
    console.log(logs)
    for (const log of logs as Array<{ product_id?: string }>) {
      if (log.product_id) {
        const linkRes = await supabaseRest(
          `system_plans?internal_plan_id=eq.${encodeURIComponent(log.product_id)}&select=id&limit=1`,
          { cache: 'no-store' },
        )
        const link = ((await linkRes.json()) as Array<{ id: string }>)[0]
        const mapCountRes = link
          ? await supabaseRest(
              `plan_mappings?system_plan_id=eq.${encodeURIComponent(link.id)}&select=id`,
              { cache: 'no-store', headers: { Prefer: 'count=exact' } },
            )
          : null
        const countHeader = mapCountRes?.headers.get('content-range')
        console.log('  product_id', log.product_id?.slice(0, 8), '→ system_plan', link?.id?.slice(0, 8) ?? 'NOT LINKED', '| mappings:', countHeader)
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
