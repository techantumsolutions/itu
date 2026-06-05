import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { supabaseRest } from '../lib/db/supabase-rest'
import { getOrCreateCanonicalCountry } from '../lib/aggregator/country-normalizer'

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

async function main() {
  loadDotEnv()
  console.log('Starting Country Normalization & Operator Deduplication Migration (Paginated)...')

  // 1. Fetch all system operators with pagination
  const operators: any[] = []
  let offset = 0
  let hasMore = true
  
  while (hasMore) {
    console.log(`Fetching system operators (offset: ${offset})...`)
    const opsRes = await supabaseRest(`system_operators?select=*&limit=1000&offset=${offset}`, { cache: 'no-store' })
    if (!opsRes.ok) {
      throw new Error(`Failed to fetch system operators at offset ${offset}: ${await opsRes.text()}`)
    }
    const batch = await opsRes.json() as any[]
    if (batch.length === 0) {
      hasMore = false
    } else {
      operators.push(...batch)
      offset += batch.length
      if (batch.length < 1000) {
        hasMore = false
      }
    }
  }
  console.log(`Fetched a total of ${operators.length} system operators.`)

  // 2. Normalize countries and update operators
  const uniqueRawCountryIds = Array.from(new Set(operators.map(op => op.country_id).filter(Boolean)))
  console.log(`Found ${uniqueRawCountryIds.length} unique raw country IDs. Normalizing...`)

  const canonicalCountryMap = new Map<string, string>() // raw -> canonical_id

  for (const rawId of uniqueRawCountryIds) {
    const canonical = await getOrCreateCanonicalCountry({
      iso2: rawId.length === 2 ? rawId : undefined,
      iso3: rawId.length === 3 ? rawId : undefined,
    })

    if (canonical) {
      canonicalCountryMap.set(rawId, canonical.id)
      console.log(`  Normalized: "${rawId}" -> "${canonical.id}" (${canonical.name})`)
    } else {
      console.warn(`  Could not normalize country ID: "${rawId}". Defaulting to itself.`)
      canonicalCountryMap.set(rawId, rawId)
    }
  }

  // Update country_id on operators in database
  console.log('Updating operators with canonical country IDs in database...')
  for (const op of operators) {
    const canonicalId = canonicalCountryMap.get(op.country_id)
    if (canonicalId && canonicalId !== op.country_id) {
      console.log(`  Updating operator "${op.system_operator_name}" (${op.id}): "${op.country_id}" -> "${canonicalId}"`)
      const patchRes = await supabaseRest(`system_operators?id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ country_id: canonicalId })
      })
      if (!patchRes.ok) {
        console.error(`  Failed to update operator ${op.id}:`, await patchRes.text())
      }
    }
  }

  // 3. Find and Merge Duplicate Operators (same slug/name and country_id)
  console.log('Checking for duplicate system operators...')
  
  // Re-fetch operators to get updated country_ids with pagination
  const updatedOps: any[] = []
  let updatedOffset = 0
  let updatedHasMore = true
  
  while (updatedHasMore) {
    console.log(`Re-fetching system operators (offset: ${updatedOffset})...`)
    const updatedOpsRes = await supabaseRest(`system_operators?select=*&limit=1000&offset=${updatedOffset}`, { cache: 'no-store' })
    if (!updatedOpsRes.ok) {
      throw new Error(`Failed to re-fetch system operators at offset ${updatedOffset}: ${await updatedOpsRes.text()}`)
    }
    const batch = await updatedOpsRes.json() as any[]
    if (batch.length === 0) {
      updatedHasMore = false
    } else {
      updatedOps.push(...batch)
      updatedOffset += batch.length
      if (batch.length < 1000) {
        updatedHasMore = false
      }
    }
  }
  console.log(`Re-fetched a total of ${updatedOps.length} system operators.`)

  // Group by slug + country_id
  const groups = new Map<string, any[]>()
  for (const op of updatedOps) {
    const key = `${op.slug}:${op.country_id}`.toLowerCase()
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(op)
  }

  for (const [key, ops] of groups.entries()) {
    if (ops.length <= 1) continue

    console.log(`Duplicate found for key "${key}": ${ops.length} operators.`)
    // Pick the target (first one)
    const target = ops[0]
    const sources = ops.slice(1)

    console.log(`  Merging into Target: "${target.system_operator_name}" (${target.id})`)

    for (const source of sources) {
      console.log(`    Merging Source: "${source.system_operator_name}" (${source.id})`)

      // Move system plans from source to target
      const plansRes = await supabaseRest(`system_plans?system_operator_id=eq.${source.id}&select=*`, { cache: 'no-store' })
      if (plansRes.ok) {
        const plans = await plansRes.json() as any[]
        for (const sp of plans) {
          // Check for signature conflicts
          const conflictRes = await supabaseRest(
            `system_plans?system_operator_id=eq.${target.id}&normalized_signature=eq.${encodeURIComponent(sp.normalized_signature)}&select=*&limit=1`,
            { cache: 'no-store' }
          )
          if (conflictRes.ok) {
            const conflicts = await conflictRes.json() as any[]
            if (conflicts.length > 0) {
              const targetSp = conflicts[0]
              console.log(`      Signature conflict on plan "${sp.system_plan_name}". Remapping plan mappings...`)
              
              // Remap plan mappings to target plan
              await supabaseRest(`plan_mappings?system_plan_id=eq.${sp.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ system_plan_id: targetSp.id })
              })
              // Remap duplicate suggests
              await supabaseRest(`duplicate_plan_suggestions?suggested_system_plan_id=eq.${sp.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ suggested_system_plan_id: targetSp.id })
              })
              // Delete source plan
              await supabaseRest(`system_plans?id=eq.${sp.id}`, { method: 'DELETE' })
              continue
            }
          }

          // Update system operator ID
          await supabaseRest(`system_plans?id=eq.${sp.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ system_operator_id: target.id })
          })
        }
      }

      // Remap operator mappings
      await supabaseRest(`operator_mappings?system_operator_id=eq.${source.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ system_operator_id: target.id })
      })

      // Remap system operator lineage
      const lineageRes = await supabaseRest(`system_operator_lineage?system_operator_id=eq.${source.id}&select=*`, { cache: 'no-store' })
      if (lineageRes.ok) {
        const lineages = await lineageRes.json() as any[]
        for (const lin of lineages) {
          const targetLinRes = await supabaseRest(
            `system_operator_lineage?system_operator_id=eq.${target.id}&aggregate_operator_id=eq.${lin.aggregate_operator_id}&select=id&limit=1`,
            { cache: 'no-store' }
          )
          if (targetLinRes.ok) {
            const targetLins = await targetLinRes.json() as any[]
            if (targetLins.length > 0) {
              await supabaseRest(`system_operator_lineage?id=eq.${lin.id}`, { method: 'DELETE' })
              continue
            }
          }
          await supabaseRest(`system_operator_lineage?id=eq.${lin.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ system_operator_id: target.id })
          })
        }
      }

      // Remap internal plans
      await supabaseRest(`internal_plans?operator_ref=eq.system:${source.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ operator_ref: `system:${target.id}` })
      })

      // Delete duplicate operator
      const delRes = await supabaseRest(`system_operators?id=eq.${source.id}`, { method: 'DELETE' })
      if (delRes.ok) {
        console.log(`    Deleted source operator: ${source.id}`)
      } else {
        console.error(`    Failed to delete source operator: ${source.id}`, await delRes.text())
      }
    }
  }

  console.log('Migration completed successfully. Run the SQL constraint migration now.')
}

main().catch(console.error)
