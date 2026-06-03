import { aggListProviders } from '../lib/aggregator/repository'
import { rowToProviderConfig } from '../lib/lcr-v2/provider-credentials'
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
  console.log('--- PROVIDERS IN DATABASE ---')
  try {
    const providers = await aggListProviders()
    for (const p of providers) {
      console.log(`\nProvider: ${p.name} (Code: ${p.code}, ID: ${p.id})`)
      console.log(`  Adapter Key: ${p.adapter_key}`)
      console.log(`  Active: ${p.is_active}`)
      console.log(`  Base URL: ${p.base_url}`)
      console.log(`  Status: ${p.status}`)
      console.log(`  Last Sync At: ${p.last_sync_at}`)
      console.log(`  Last Success Sync At: ${p.last_success_sync_at}`)
      console.log(`  Supported Countries:`, p.supported_countries)
      console.log(`  Credentials Encrypted Payload:`, p.credentials_encrypted)
      try {
        const config = rowToProviderConfig(p as any)
        console.log(`  Parsed Config Auth:`, config.auth)
      } catch (err: any) {
        console.log(`  Error parsing config auth:`, err.message)
      }
    }
  } catch (error) {
    console.error('Failed to load providers:', error)
  }
}

run()
