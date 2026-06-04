import { supabaseRest } from '../lib/db/supabase-rest'
import * as fs from 'fs'
import * as path from 'path'

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let value = match[2] || ''
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.substring(1, value.length - 1)
        }
        process.env[key] = value.trim()
      }
    }
  }
}

loadEnv()

async function getCount(table: string): Promise<number> {
  const res = await supabaseRest(`${table}?select=id&limit=1`, {
    headers: { Prefer: 'count=exact' },
    cache: 'no-store'
  })
  const contentRange = res.headers.get('content-range')
  if (contentRange) {
    const parts = contentRange.split('/')
    if (parts.length > 1) {
      return parseInt(parts[1], 10)
    }
  }
  return 0
}

async function getAllRows<T>(table: string, selectFields = 'id'): Promise<T[]> {
  let allRows: T[] = []
  let offset = 0
  let hasMore = true
  while (hasMore) {
    const res = await supabaseRest(`${table}?select=${selectFields}&limit=1000&offset=${offset}`, { cache: 'no-store' })
    const rows = await res.json() as T[]
    if (!rows || rows.length === 0) {
      hasMore = false
      break
    }
    allRows = allRows.concat(rows)
    if (rows.length < 1000) {
      hasMore = false
    } else {
      offset += 1000
    }
  }
  return allRows
}

async function run() {
  console.log('--- TRUE DATABASE COUNTS ---')
  try {
    const systemOperatorsCount = await getCount('system_operators')
    const systemPlansCount = await getCount('system_plans')
    const providerOperatorRawCount = await getCount('provider_operator_raw')
    const providerPlansRawCount = await getCount('provider_plans_raw')
    const operatorMappingsCount = await getCount('operator_mappings')
    const planMappingsCount = await getCount('plan_mappings')

    console.log(`System Operators count in DB: ${systemOperatorsCount}`)
    console.log(`System Plans count in DB: ${systemPlansCount}`)
    console.log(`Provider Operator Raw count in DB: ${providerOperatorRawCount}`)
    console.log(`Provider Plans Raw count in DB: ${providerPlansRawCount}`)
    console.log(`Operator Mappings count in DB: ${operatorMappingsCount}`)
    console.log(`Plan Mappings count in DB: ${planMappingsCount}`)

    console.log('\nFetching all active system operators & all active system plans to calculate match rates...')
    const systemOperators = await getAllRows<{ id: string; system_operator_name: string; status: string; country_id: string }>('system_operators', 'id,system_operator_name,status,country_id')
    const systemPlans = await getAllRows<{ id: string; system_operator_id: string; status: string }>('system_plans', 'id,system_operator_id,status')

    const activeOps = systemOperators.filter(o => o.status === 'ACTIVE')
    const activePlans = systemPlans.filter(p => p.status === 'ACTIVE')

    console.log(`Total Active System Operators: ${activeOps.length}`)
    console.log(`Total Active System Plans: ${activePlans.length}`)

    // Map system operator ID to plans
    const plansByOperator = new Map<string, any[]>()
    for (const p of systemPlans) {
      if (!plansByOperator.has(p.system_operator_id)) {
        plansByOperator.set(p.system_operator_id, [])
      }
      plansByOperator.get(p.system_operator_id)!.push(p)
    }

    let activeOpsWithPlans = 0
    let activeOpsWithoutPlans = 0
    for (const op of activeOps) {
      const opPlans = plansByOperator.get(op.id) || []
      const activeOpPlans = opPlans.filter(p => p.status === 'ACTIVE')
      if (activeOpPlans.length > 0) {
        activeOpsWithPlans++
      } else {
        activeOpsWithoutPlans++
      }
    }

    console.log(`\nActive Operators WITH active plans: ${activeOpsWithPlans}`)
    console.log(`Active Operators WITHOUT active plans: ${activeOpsWithoutPlans}`)

  } catch (error) {
    console.error('Failed to get true counts:', error)
  }
}

run()
