/**
 * LCR routing benchmark — 100 simulations with DB call counting.
 * Usage: npx tsx scratch/lcr-routing-benchmark.ts
 */
import { loadEnvConfig } from '@next/env'
import { supabaseRest } from '../lib/db/supabase-rest'
import { routeInternalPlan } from '../lib/lcr-v2/routing'
import { clearLcrRoutingCaches } from '../lib/routing/lcr-routing-cache'

loadEnvConfig(process.cwd())

const SIMULATIONS = 100

let dbCallCount = 0
const originalSupabaseRest = supabaseRest

function installDbCounter() {
  dbCallCount = 0

  // REST call counting is done via fetch wrapper in runBatch()
}

async function findSamplePlan(): Promise<{
  internalPlanId: string
  countryIso3: string
  operatorRef: string
} | null> {
  const res = await originalSupabaseRest('internal_plans?select=id,country_iso3,operator_ref&limit=1', {
    cache: 'no-store',
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{
    id: string
    country_iso3?: string
    operator_ref?: string
  }>
  const plan = rows[0]
  if (!plan?.id) return null
  return {
    internalPlanId: plan.id,
    countryIso3: plan.country_iso3 ?? 'IND',
    operatorRef: plan.operator_ref ?? 'unknown',
  }
}

async function runBatch(label: string, useCache: boolean) {
  const sample = await findSamplePlan()
  if (!sample) {
    console.error('No internal_plans found — cannot run benchmark')
    process.exit(1)
  }

  if (!useCache) clearLcrRoutingCaches()

  const { fetch: originalFetch } = globalThis
  let restCalls = 0
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/rest/v1/') || url.includes('127.0.0.1:54421')) {
      if (!url.includes('/auth/')) restCalls += 1
    }
    return originalFetch(input, init)
  }

  const decisions: string[] = []
  const latencies: number[] = []
  const start = performance.now()

  for (let i = 0; i < SIMULATIONS; i++) {
    if (i === 1 && useCache) {
      // second iteration onward benefits from warm cache
    }
    const t0 = performance.now()
    const result = await routeInternalPlan({
      internalPlanId: sample.internalPlanId,
      countryIso3: sample.countryIso3,
      operatorRef: sample.operatorRef,
      transactionId: `bench-${i}`,
    })
    latencies.push(performance.now() - t0)
    decisions.push(
      result.selected
        ? `${result.selected.providerId}:${result.selected.providerPlanId}`
        : `none:${result.ruleApplied}`,
    )
  }

  globalThis.fetch = originalFetch

  const totalMs = performance.now() - start
  const uniqueDecisions = new Set(decisions)
  const consistent = uniqueDecisions.size === 1

  return {
    label,
    simulations: SIMULATIONS,
    planId: sample.internalPlanId.slice(0, 8),
    restCalls,
    restCallsPerSim: (restCalls / SIMULATIONS).toFixed(2),
    totalMs: Math.round(totalMs),
    avgMs: (totalMs / SIMULATIONS).toFixed(1),
    p95Ms: latencies.sort((a, b) => a - b)[Math.floor(SIMULATIONS * 0.95)]?.toFixed(1),
    consistent,
    selectedProvider: decisions[0],
    uniqueDecisionCount: uniqueDecisions.size,
  }
}

async function main() {
  console.log('LCR Routing Benchmark — 100 simulations per mode\n')

  clearLcrRoutingCaches()
  const cold = await runBatch('cold (cache cleared, sim 1 cold rest)', false)

  clearLcrRoutingCaches()
  // Warm: first call populates cache, remaining 99 hit cache
  const warm = await runBatch('warm (30s TTL cache, sims 2-100 cached)', true)

  console.log('| Metric | Cold (1st sim) | Warm (100 sims, cached reads) |')
  console.log('|--------|----------------|-------------------------------|')
  console.log(`| REST calls total | ${cold.restCalls} | ${warm.restCalls} |`)
  console.log(`| REST calls / sim | ${cold.restCallsPerSim} | ${warm.restCallsPerSim} |`)
  console.log(`| Total time (ms) | ${cold.totalMs} | ${warm.totalMs} |`)
  console.log(`| Avg latency (ms) | ${cold.avgMs} | ${warm.avgMs} |`)
  console.log(`| P95 latency (ms) | ${cold.p95Ms} | ${warm.p95Ms} |`)
  console.log(`| Decision consistent | ${cold.consistent} | ${warm.consistent} |`)
  console.log(`| Selected provider | ${cold.selectedProvider} | ${warm.selectedProvider} |`)
  console.log('')
  console.log(
    warm.consistent && cold.selectedProvider === warm.selectedProvider
      ? 'PASS: Routing decisions unchanged after optimization'
      : 'WARN: Decision variance detected — review plan data',
  )

  const reduction =
    cold.restCalls > 0 ? (((cold.restCalls - warm.restCalls) / cold.restCalls) * 100).toFixed(1) : '0'
  console.log(`REST call reduction (warm vs cold total): ${reduction}%`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
