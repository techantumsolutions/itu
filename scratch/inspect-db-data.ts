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

import { supabaseRest } from '../lib/db/supabase-rest'
import { validateRawOperatorPlans, extractRawPlanFields, isTelecomPlanRaw, isNonTelecomPlanRaw } from '../lib/aggregator/telecom-validator'

async function inspect() {
  console.log('--- INSPECTING DATABASE DATA FOR OPERATORS & PLANS ---')

  // Load first 5 raw operators
  const opRes = await supabaseRest('provider_operator_raw?limit=10', { cache: 'no-store' })
  if (!opRes.ok) {
    console.error('Failed to fetch raw operators:', await opRes.text())
    return
  }

  const rawOps = await opRes.json() as any[]
  console.log(`Fetched ${rawOps.length} raw operators from provider_operator_raw.`)

  for (const op of rawOps) {
    // Fetch raw plans
    const planRes = await supabaseRest(`provider_plans_raw?provider_operator_raw_id=eq.${op.id}&limit=50`, { cache: 'no-store' })
    if (!planRes.ok) {
      console.error(`Failed to fetch plans for operator ${op.provider_operator_name}:`, await planRes.text())
      continue
    }

    const plans = await planRes.json() as any[]
    console.log(`\nOperator: '${op.provider_operator_name}' (ID: ${op.id}, Provider: ${op.service_provider_id}, Plans: ${plans.length})`)

    if (plans.length > 0) {
      const sampleRaw = plans[0].raw_json || plans[0].row_json || plans[0].raw || plans[0]
      console.log('Sample raw plan structure (keys):', Object.keys(sampleRaw))
      console.log('Sample raw plan tags:', sampleRaw.tags || sampleRaw.Tags)
      console.log('Sample raw plan benefits:', sampleRaw.benefits || sampleRaw.Benefits)
      console.log('Sample raw plan service:', sampleRaw.service || sampleRaw.Service)

      const validation = validateRawOperatorPlans(plans)
      console.log(`Validation result: Passed = ${validation.passed}, Reason = ${validation.reason}, Telecom plans: ${validation.telecomPlanCount}, Total plans: ${validation.totalPlanCount}, Ratio: ${validation.telecomRatio}`)
    } else {
      console.log('No plans found for this operator.')
    }
  }
}

inspect()
