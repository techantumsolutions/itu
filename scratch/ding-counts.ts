import fs from 'fs'
import { supabaseRest } from '../lib/db/supabase-rest'

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (!m) continue
  let v = m[2] || ''
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  process.env[m[1]] = v.trim()
}

async function count(path: string) {
  const res = await supabaseRest(path, {
    headers: { Prefer: 'count=exact' },
    cache: 'no-store',
  })
  return res.headers.get('content-range')
}

async function main() {
  const pid = 'bb376d0e-2cd6-4958-8956-4a9881948f86'
  console.log('raw_plans', await count(`provider_plans_raw?provider_id=eq.${pid}&select=id`))
  console.log('raw_ops', await count(`provider_operator_raw?service_provider_id=eq.${pid}&select=id`))
}

main().catch(console.error)
