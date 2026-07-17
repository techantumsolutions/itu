/**
 * Background worker: deactivate system_plans with no plan_mappings or no available provider.
 *
 * Run:
 *   pnpm system-plans:availability
 *
 * Env:
 *   SYSTEM_PLAN_AVAILABILITY_INTERVAL_MS — sweep interval (default 300000 = 5 min)
 *   SYSTEM_PLAN_AVAILABILITY_RUN_ONCE=1    — run one sweep and exit
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { sweepInactiveSystemPlansWithoutProviders } from '@/lib/admin/system-plan-availability'

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
  Number(process.env.SYSTEM_PLAN_AVAILABILITY_INTERVAL_MS ?? '300000') || 300000,
  60_000,
)
const runOnce = process.env.SYSTEM_PLAN_AVAILABILITY_RUN_ONCE === '1'

let running = false
let shuttingDown = false
let intervalHandle: ReturnType<typeof setInterval> | null = null

async function runSweep() {
  if (shuttingDown) return
  if (running) {
    console.log('[system-plans-availability] previous sweep still running, skipping')
    return
  }

  running = true
  const startedAt = new Date().toISOString()

  try {
    const result = await sweepInactiveSystemPlansWithoutProviders()
    console.log(
      `[system-plans-availability] ${startedAt} scanned=${result.scanned} deactivated=${result.deactivated} errors=${result.errors}`,
    )

    if (result.deactivatedPlans.length > 0) {
      for (const plan of result.deactivatedPlans.slice(0, 20)) {
        console.log(
          `[system-plans-availability] deactivated plan=${plan.systemPlanId} name=${plan.systemPlanName ?? 'n/a'} reason=${plan.reason}`,
        )
      }
      if (result.deactivatedPlans.length > 20) {
        console.log(
          `[system-plans-availability] ...and ${result.deactivatedPlans.length - 20} more`,
        )
      }
    }
  } catch (error) {
    console.error('[system-plans-availability] sweep failed:', error)
  } finally {
    running = false
  }
}

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[system-plans-availability] ${signal} received — stop scheduling new runs`)

  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }

  if (running) {
    console.log('[system-plans-availability] waiting for in-flight sweep to finish')
    while (running) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  console.log('[system-plans-availability] shutdown complete')
  process.exit(0)
}

console.log(
  `[system-plans-availability] starting (interval=${intervalMs}ms, runOnce=${runOnce})`,
)

async function main() {
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })

  await runSweep()

  if (runOnce || shuttingDown) return

  intervalHandle = setInterval(() => {
    void runSweep()
  }, intervalMs)
}

main().catch((error) => {
  console.error('[system-plans-availability] fatal:', error)
  process.exit(1)
})
