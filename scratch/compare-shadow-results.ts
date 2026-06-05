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

async function getAllRows<T>(table: string, queryParams = 'select=*'): Promise<T[]> {
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
  console.log('=== SHADOW MODE VS PRODUCTION COMPARISON REPORT ===\n')

  try {
    // 1. Fetch all shadow audit entries
    const audits = await getAllRows<any>('classification_audit', 'decision=eq.SHADOW')
    console.log(`Total shadow audit records found: ${audits.length}`)

    // De-duplicate: Keep only the latest entry per provider_operator_id/provider_plan_id
    const latestAuditsMap = new Map<string, any>()
    for (const audit of audits) {
      const key = audit.entity_type === 'operator' 
        ? `op:${audit.provider_operator_id}`
        : `plan:${audit.provider_plan_id}`
      const existing = latestAuditsMap.get(key)
      if (!existing || new Date(audit.created_at) > new Date(existing.created_at)) {
        latestAuditsMap.set(key, audit)
      }
    }
    const latestAudits = Array.from(latestAuditsMap.values())
    console.log(`Unique shadow audit records (latest): ${latestAudits.length}`)

    const opAudits = latestAudits.filter(a => a.entity_type === 'operator')
    const planAudits = latestAudits.filter(a => a.entity_type === 'plan')
    console.log(`- Unique Operator Audits: ${opAudits.length}`)
    console.log(`- Unique Plan Audits: ${planAudits.length}`)

    // 2. Fetch current system operator mappings
    const mappings = await getAllRows<any>('operator_mappings', 'select=id,service_provider_id,provider_operator_raw_id,provider_operator_id,system_operator_id')
    console.log(`\nActive Operator Mappings in Prod: ${mappings.length}`)

    // 3. Compare Operators
    console.log('\n--- Operator Classification Comparisons ---')
    let matchedOps = 0
    let mismatchedOps = 0
    const mismatches: any[] = []

    for (const opAudit of opAudits) {
      // Find current mapping for this provider operator
      const matchingMap = mappings.find(m => 
        m.provider_operator_id === opAudit.provider_operator_id &&
        m.service_provider_id !== null // match config provider code if possible
      )

      const currentlyMapped = !!matchingMap
      const shadowIsTelecom = opAudit.classification === 'TELECOM'

      if (currentlyMapped === shadowIsTelecom) {
        matchedOps++
      } else {
        mismatchedOps++
        mismatches.push({
          providerOperatorId: opAudit.provider_operator_id,
          name: opAudit.entity_name,
          country: opAudit.details?.countryCode || 'N/A',
          currentlyMapped,
          shadowClassification: opAudit.classification,
          reasonCode: opAudit.reason_code,
          confidence: opAudit.confidence
        })
      }
    }

    console.log(`Matched Operator Decisions (Current Mapped vs Shadow Telecom): ${matchedOps}`)
    console.log(`Mismatched Operator Decisions: ${mismatchedOps}`)

    if (mismatches.length > 0) {
      console.log('\nSample Mismatches (First 20):')
      console.table(mismatches.slice(0, 20))
    }

    // 4. Compare Plans
    console.log('\n--- Plan Classification Comparisons ---')
    const planMappings = await getAllRows<any>('plan_mappings', 'select=id,service_provider_id,provider_plan_raw_id,provider_plan_id,system_plan_id')
    console.log(`Active Plan Mappings in Prod: ${planMappings.length}`)

    let matchedPlans = 0
    let mismatchedPlans = 0
    const planMismatches: any[] = []

    // Map system_plans for additional info
    const systemPlans = await getAllRows<any>('system_plans', 'select=id,system_plan_name,status')

    for (const planAudit of planAudits) {
      const matchingMap = planMappings.find(m => m.provider_plan_id === planAudit.provider_plan_id)
      const currentlyMapped = !!matchingMap
      
      const allowedCategories = ['AIRTIME', 'DATA', 'VOICE', 'SMS', 'BUNDLE']
      const shadowIsAllowed = allowedCategories.includes(planAudit.classification)

      if (currentlyMapped === shadowIsAllowed) {
        matchedPlans++
      } else {
        mismatchedPlans++
        planMismatches.push({
          providerPlanId: planAudit.provider_plan_id,
          name: planAudit.entity_name,
          currentlyMapped,
          shadowClassification: planAudit.classification,
          reasonCode: planAudit.reason_code,
          confidence: planAudit.confidence
        })
      }
    }

    console.log(`Matched Plan Decisions (Current Mapped vs Shadow Allowed): ${matchedPlans}`)
    console.log(`Mismatched Plan Decisions: ${mismatchedPlans}`)

    if (planMismatches.length > 0) {
      console.log('\nSample Plan Mismatches (First 20):')
      console.table(planMismatches.slice(0, 20))
    }

  } catch (error) {
    console.error('Error running comparison:', error)
  }
}

run()
