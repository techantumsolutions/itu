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

async function getAllRows<T>(table: string, queryParams: string): Promise<T[]> {
  let allRows: T[] = []
  let offset = 0
  let hasMore = true
  while (hasMore) {
    const res = await supabaseRest(`${table}?${queryParams}&limit=1000&offset=${offset}`, { cache: 'no-store' })
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
  console.log('=== START MAPPINGS BACKFILL ===')

  try {
    // 1. BACKFILL OPERATOR MAPPINGS
    console.log('Fetching operator mappings to backfill...')
    const opMappings = await getAllRows<any>('operator_mappings', 'provider_operator_id=is.null&select=id,provider_operator_raw_id')
    console.log(`Found ${opMappings.length} operator mappings with null provider_operator_id.`)

    if (opMappings.length > 0) {
      console.log('Fetching raw operators...')
      const rawOps = await getAllRows<any>('provider_operator_raw', 'select=id,provider_operator_id')
      const rawOpMap = new Map<string, string>()
      for (const op of rawOps) {
        rawOpMap.set(op.id, op.provider_operator_id)
      }

      console.log('Backfilling operator mappings...')
      let opCount = 0
      for (const mapping of opMappings) {
        const providerOpId = rawOpMap.get(mapping.provider_operator_raw_id)
        if (providerOpId) {
          const res = await supabaseRest(`operator_mappings?id=eq.${mapping.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ provider_operator_id: providerOpId }),
          })
          if (res.ok) {
            opCount++
          } else {
            console.error(`Failed to patch operator mapping ${mapping.id}: ${res.statusText}`)
          }
        }
      }
      console.log(`Successfully backfilled ${opCount} operator mappings.`)
    }

    // 2. BACKFILL PLAN MAPPINGS
    console.log('\nFetching plan mappings to backfill...')
    const planMappings = await getAllRows<any>('plan_mappings', 'provider_plan_id=is.null&select=id,provider_plan_raw_id')
    console.log(`Found ${planMappings.length} plan mappings with null provider_plan_id.`)

    if (planMappings.length > 0) {
      console.log('Fetching raw plans...')
      const rawPlans = await getAllRows<any>('provider_plans_raw', 'select=id,provider_plan_id')
      const rawPlanMap = new Map<string, string>()
      for (const plan of rawPlans) {
        rawPlanMap.set(plan.id, plan.provider_plan_id)
      }

      console.log('Backfilling plan mappings (in batches)...')
      let planCount = 0
      // Process in batches of 100 to avoid overloading
      for (let i = 0; i < planMappings.length; i += 100) {
        const batch = planMappings.slice(i, i + 100)
        await Promise.all(batch.map(async (mapping) => {
          const providerPlanId = rawPlanMap.get(mapping.provider_plan_raw_id)
          if (providerPlanId) {
            const res = await supabaseRest(`plan_mappings?id=eq.${mapping.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ provider_plan_id: providerPlanId }),
            })
            if (res.ok) {
              planCount++
            } else {
              console.error(`Failed to patch plan mapping ${mapping.id}: ${res.statusText}`)
            }
          }
        }))
        if (i > 0 && i % 1000 === 0) {
          console.log(`Processed ${i} mappings...`)
        }
      }
      console.log(`Successfully backfilled ${planCount} plan mappings.`)
    }

    console.log('\n=== BACKFILL COMPLETED ===')
  } catch (error) {
    console.error('Backfill failed:', error)
  }
}

run()
