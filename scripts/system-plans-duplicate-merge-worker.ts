/**
 * Background worker: merge duplicate system_plans (same country, operator, name/amount/currency).
 *
 * Run once:
 *   pnpm system-plans:merge-duplicates
 *
 * Run continuously (default every 5 min):
 *   pnpm system-plans:merge-duplicates
 *
 * Env:
 *   SYSTEM_PLAN_DUPLICATE_MERGE_INTERVAL_MS — interval (default 300000 = 5 min)
 *   SYSTEM_PLAN_DUPLICATE_MERGE_RUN_ONCE=1   — run one sweep and exit
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { sweepDuplicateSystemPlans } from '@/lib/aggregator/system-plan-duplicate-sweep'

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

loadDotEnv()

const intervalMs = Math.max(
  Number(process.env.SYSTEM_PLAN_DUPLICATE_MERGE_INTERVAL_MS ?? '300000') || 300_000,
  60_000,
)
const runOnce = process.env.SYSTEM_PLAN_DUPLICATE_MERGE_RUN_ONCE === '1'

let running = false

async function runSweep() {
  if (running) {
    console.log('[system-plans-duplicate-merge] previous sweep still running, skipping')
    return
  }

  running = true
  const startedAt = new Date().toISOString()

  try {
    const result = await sweepDuplicateSystemPlans()
    console.log(
      `[system-plans-duplicate-merge] ${startedAt} operators=${result.operatorsScanned} plans=${result.plansScanned} groups=${result.duplicateGroupsFound} merged=${result.plansMerged} rounds=${result.mergeRounds}`,
    )
  } catch (error) {
    console.error('[system-plans-duplicate-merge] sweep failed:', error)
  } finally {
    running = false
  }
}

console.log(
  `[system-plans-duplicate-merge] starting (interval=${intervalMs}ms, runOnce=${runOnce})`,
)

async function main() {
  await runSweep()

  if (!runOnce) {
    setInterval(() => {
      void runSweep()
    }, intervalMs)
  }
}

main().catch((error) => {
  console.error('[system-plans-duplicate-merge] fatal:', error)
  process.exit(1)
})
