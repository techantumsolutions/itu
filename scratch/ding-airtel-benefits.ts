import fs from 'fs'
import { supabaseRest } from '../lib/db/supabase-rest'
import { hasExcludedPlanBenefits } from '../lib/aggregator/telecom-validator'

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (!m) continue
  let v = m[2] || ''
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  process.env[m[1]] = v.trim()
}

async function main() {
  const res = await supabaseRest(
    'provider_plans_raw?provider_id=eq.bb376d0e-2cd6-4958-8956-4a9881948f86&provider_operator_raw_id=eq.47bcfa44-e5ba-462c-8693-8454fe67c84a&select=provider_plan_name,raw_json,benefits_json',
    { cache: 'no-store' },
  )
  const plans = await res.json()
  const benefitShapes = new Set<string>()
  for (const p of plans) {
    const raw = p.raw_json || {}
    const ex = hasExcludedPlanBenefits(raw)
    const benefits = raw.Benefits || raw.benefits || []
    benefitShapes.add(JSON.stringify(benefits).slice(0, 80))
    if (ex.excluded) console.log('EXCLUDED', p.provider_plan_name, ex.reason, benefits)
  }
  console.log('PLAN_COUNT', plans.length)
  console.log('UNIQUE_BENEFIT_SHAPES', [...benefitShapes])
}

main().catch(console.error)
