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

// Check after loadEnv
console.log('DTONE_API_KEY:', JSON.stringify(process.env.DTONE_API_KEY))
console.log('DTONE_API_SECRET:', JSON.stringify(process.env.DTONE_API_SECRET))

import { syncProviderCatalog } from '../lib/lcr/sync-catalog'

async function run() {
  const dtoneProviderId = 'a7b07821-e109-4a56-987a-30afaf2f8654'
  console.log(`Starting sync for DT One provider (ID: ${dtoneProviderId})...`)
  try {
    const result = await syncProviderCatalog(dtoneProviderId, { countries: ['MEX'] })
    console.log('Sync result:', JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('Sync failed:', error)
  }
}

run()
