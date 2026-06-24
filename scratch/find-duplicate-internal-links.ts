import * as fs from 'fs'
import { supabaseRest } from '../lib/db/supabase-rest'

function loadEnv() {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (!m) continue
    let v = m[2] || ''
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[m[1]] = v.trim()
  }
}
loadEnv()

async function main() {
  const res = await supabaseRest('system_plans?select=id,internal_plan_id,system_plan_name&limit=5000', {
    cache: 'no-store',
  })
  const rows = (await res.json()) as Array<{
    id: string
    internal_plan_id?: string | null
    system_plan_name?: string
  }>

  const byInternal = new Map<string, typeof rows>()
  for (const r of rows) {
    if (!r.internal_plan_id) continue
    const list = byInternal.get(r.internal_plan_id) ?? []
    list.push(r)
    byInternal.set(r.internal_plan_id, list)
  }

  const dups = [...byInternal.entries()].filter(([, v]) => v.length > 1)
  console.log('system_plans:', rows.length)
  console.log('internal_plan_ids shared by multiple system_plans:', dups.length)

  for (const [internalId, plans] of dups.slice(0, 15)) {
    console.log(`\ninternal_plan_id ${internalId}`)
    for (const p of plans) {
      const mapRes = await supabaseRest(
        `plan_mappings?system_plan_id=eq.${encodeURIComponent(p.id)}&select=id`,
        { cache: 'no-store', headers: { Prefer: 'count=exact' } },
      )
      const count = mapRes.headers.get('content-range')?.split('/')[1] ?? '?'
      console.log(`  system_plan ${p.id.slice(0, 8)} | mappings: ${count} | ${p.system_plan_name}`)
    }
  }
}

main()
