import * as fs from 'fs'
import { loadAuthoritativeCandidateBundle } from '../lib/recharge-orchestration/authoritative-candidate-loader'

for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (!m) continue
  let v = m[2] || ''
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  process.env[m[1]] = v.trim()
}

async function main() {
  const internal = '4c8fa2f8-9251-4aeb-bbce-f0cfa2721cf4'
  const system = 'd5dd2eaa-7a49-4323-bf75-38eda338a742'

  const a = await loadAuthoritativeCandidateBundle(internal)
  const b = await loadAuthoritativeCandidateBundle(internal, { systemPlanId: system })
  console.log('internal_plan only:', a?.mappings.length)
  console.log('with explicit system_plan_id:', b?.mappings.length)
}

main()
