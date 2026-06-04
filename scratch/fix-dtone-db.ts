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

import { aggPatchProvider } from '../lib/aggregator/repository'
import { syncProviderCatalog } from '../lib/lcr/sync-catalog'

async function run() {
  const dtoneProviderId = 'a7b07821-e109-4a56-987a-30afaf2f8654'
  
  console.log(`1. Patching DT One provider base URL to preprod in DB...`)
  try {
    const patchResult = await aggPatchProvider(dtoneProviderId, {
      base_url: 'https://preprod-dvs-api.dtone.com'
    })
    console.log('Successfully patched DT One in DB:', patchResult)
  } catch (err: any) {
    console.error('Failed to patch DT One in DB:', err.message || err)
    return
  }

  console.log(`\n2. Triggering sync for DT One provider...`)
  try {
    const result = await syncProviderCatalog(dtoneProviderId, { countries: ['MEX'] })
    console.log('Sync completed successfully!')
    console.log('Normalized plans count:', result.normalized)
  } catch (error: any) {
    console.error('Sync failed with error:', error.message || error)
  }
}

run()
