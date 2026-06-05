import { supabaseRest } from '../lib/db/supabase-rest'
import { syncProviderCatalog } from '../lib/lcr/sync-catalog'
import { aggListProviders } from '../lib/aggregator/repository'
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

async function testOverride() {
  console.log('=== INTEGRATION TEST: REVIEW QUEUE & RULE OVERRIDES ===\n')

  try {
    // 1. Find a pending review queue operator
    const res = await supabaseRest('classification_review_queue?entity_type=eq.operator&status=eq.PENDING&limit=1', { cache: 'no-store' })
    const items = await res.json()
    const item = items[0]

    if (!item) {
      console.log('No pending operator items found in the review queue. Run sync first!')
      return
    }

    console.log(`Found pending review item: "${item.entity_name}" (Type: ${item.entity_type}, ID: ${item.id})`)

    // Clear any existing rule for this pattern to keep test clean
    const cleanPattern = item.entity_name.trim().toUpperCase()
    await supabaseRest(`classification_rules?pattern=eq.${encodeURIComponent(cleanPattern)}`, { method: 'DELETE' })
    console.log(`Cleared existing rules for pattern "${cleanPattern}"`)

    // 2. Simulate Admin approval action
    console.log(`Simulating override approval for "${item.entity_name}" -> TELECOM...`)
    
    // Create rule
    const ruleRes = await supabaseRest('classification_rules?on_conflict=pattern,match_type,entity_type', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        pattern: cleanPattern,
        match_type: 'EXACT',
        entity_type: 'operator',
        classification: 'TELECOM',
        is_active: true
      })
    })
    console.log(`Rule creation response status: ${ruleRes.status}`)

    // Update queue item
    const updateRes = await supabaseRest(`classification_review_queue?id=eq.${item.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'APPROVED',
        notes: 'Approved via integration test override.'
      })
    })
    console.log(`Review queue item status update status: ${updateRes.status}`)

    // 3. Verify rule exists
    const verifyRuleRes = await supabaseRest(`classification_rules?pattern=eq.${encodeURIComponent(cleanPattern)}&limit=1`, { cache: 'no-store' })
    const rules = await verifyRuleRes.json()
    console.log(`Verified rule in DB:`, rules)

    // 4. Run a sync cycle and verify that this operator is now ACCEPTED and NOT pending review anymore!
    console.log('\nRunning sync cycle to verify rule enforcement...')
    const providers = await aggListProviders()
    const valuetopupProvider = providers.find((p) => p.code === 'VALUETOPUP')
    if (!valuetopupProvider) {
      throw new Error('VALUETOPUP provider not found')
    }

    // Clear classification audit table entries for this operator to check fresh result
    await supabaseRest(`classification_audit?entity_name=eq.${encodeURIComponent(item.entity_name)}`, { method: 'DELETE' })

    const result = await syncProviderCatalog(valuetopupProvider.id)
    console.log('Sync finished!')

    // 5. Query classification audit to see if the decision is now 'ACCEPTED' with reasonCode 'MANUAL_RULE_OVERRIDE'
    const auditRes = await supabaseRest(`classification_audit?entity_name=eq.${encodeURIComponent(item.entity_name)}&order=created_at.desc&limit=1`, { cache: 'no-store' })
    const audits = await auditRes.json()
    const audit = audits[0]

    console.log('\n--- VERIFICATION RESULT ---')
    if (audit) {
      console.log(`Operator Name: "${audit.entity_name}"`)
      console.log(`Decision: ${audit.decision}`)
      console.log(`Classification: ${audit.classification}`)
      console.log(`Reason Code: ${audit.reason_code}`)
      
      if (audit.decision === 'ACCEPTED' && audit.reason_code === 'MANUAL_RULE_OVERRIDE') {
        console.log('\nSUCCESS: Learning override successfully enforced in subsequent sync cycle!')
      } else {
        console.log('\nFAILURE: Unexpected audit decision or reason code.');
      }
    } else {
      console.log('\nFAILURE: No audit record found for operator.');
    }

  } catch (error) {
    console.error('Test override failed:', error)
  }
}

testOverride()
