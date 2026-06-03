import { aggListProviders } from './lib/aggregator/repository'
import { syncProviderCatalog } from './lib/lcr/sync-catalog'
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
        process.env[key] = value
      }
    }
  }
}

loadEnv()

async function run() {
  console.log('--- START COUNTRY-LIMITED SYNC TEST ---')
  try {
    const providers = await aggListProviders()
    const dtoneProvider = providers.find((p) => p.adapter_key === 'dtone' || p.code === 'DTONE')
    if (!dtoneProvider) {
      console.error('DTOne provider not found in database.')
      return
    }

    console.log(`Starting sync for DTOne provider (ID: ${dtoneProvider.id}) scoped to IND and NGA...`)
    const result = await syncProviderCatalog(dtoneProvider.id, { countries: ['IND', 'NGA'] })
    console.log('Sync completed successfully!')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error('Sync failed with error:')
    console.error(error)
  }
}

run()
