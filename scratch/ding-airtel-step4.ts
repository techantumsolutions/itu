import fs from 'fs'
import { supabaseRest } from '../lib/db/supabase-rest'
import { stringToBigInt } from '../lib/aggregator/agg-id-hash'

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (!m) continue
  let v = m[2] || ''
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  process.env[m[1]] = v.trim()
}

const pid = 'bb376d0e-2cd6-4958-8956-4a9881948f86'

async function json(path: string) {
  const res = await supabaseRest(path, { cache: 'no-store' })
  return res.json()
}

async function main() {
const step4 = await json(
  `sync_logs?service_provider_id=eq.${pid}&stage=eq.step4_normalize&order=created_at.desc&limit=1&select=metadata,duplicate_count`,
)
console.log('STEP4', JSON.stringify(step4, null, 2))

const rawOp = await json(
  'provider_operator_raw?id=eq.47bcfa44-e5ba-462c-8693-8454fe67c84a&select=provider_operator_id',
)
const aggOp = await json(
  'agg_operators?id=eq.342b91ed-2f4c-4bcc-ae70-08f1b8062564&select=aggregator_operator_id',
)
const hash = stringToBigInt(rawOp[0].provider_operator_id)
console.log('HASH_MATCH', hash, aggOp[0].aggregator_operator_id, hash === Number(aggOp[0].aggregator_operator_id))

const indiaAudit = await json(
  `operator_domain_audit_logs?provider_code=eq.DING&operator_name=eq.Airtel%20India&order=created_at.desc&limit=1&select=*`,
)
console.log('INDIA_AUDIT', JSON.stringify(indiaAudit[0], null, 2))
}

main().catch(console.error)
