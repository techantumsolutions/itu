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

import { syncProviderCatalog } from '../lib/lcr/sync-catalog'
import { aggListProviders } from '../lib/aggregator/repository'

async function run() {
  console.log('--- STARTING ALL PROVIDERS SYNC TEST ---')
  const providers = await aggListProviders()
  
  for (const p of providers) {
    if (!p.is_active) {
      console.log(`Skipping inactive provider: ${p.name}`)
      continue
    }
    console.log(`\nSyncing ${p.name} (Adapter: ${p.adapter_key}, ID: ${p.id})...`)
    try {
      const started = Date.now()
      const result = await syncProviderCatalog(p.id, { countries: ['MEX'] })
      const elapsed = ((Date.now() - started) / 1000).toFixed(2)
      console.log(`Sync success for ${p.name} in ${elapsed}s!`)
      console.log(`  Fetched: ${result.fetchedRaw || 0} plans`)
      console.log(`  Normalized: ${result.normalized || 0} plans`)
      console.log(`  Mapped: ${result.mappedPlans || 0} plans`)
    } catch (error: any) {
      console.error(`Sync failed for ${p.name}:`, error.message || error)
    }
  }
}

run()
