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

async function run() {
  const dingProviderId = 'bb376d0e-2cd6-4958-8956-4a9881948f86'
  console.log(`Starting optimized sync for Ding provider (ID: ${dingProviderId})...`)
  const start = Date.now()
  try {
    const result = await syncProviderCatalog(dingProviderId, { countries: ['MEX'] })
    console.log('Sync completed successfully!')
    console.log(`Duration: ${(Date.now() - start) / 1000}s`)
    console.log('Normalized plans count:', result.normalized)
    console.log('Result:', JSON.stringify(result, null, 2))
  } catch (error: any) {
    console.error('Sync failed with error:', error.message || error)
  }
}

run()
