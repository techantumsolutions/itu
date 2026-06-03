import { fetchDtoneProductsPage } from './lib/dtone'
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
  try {
    console.log('Fetching first page of DTOne preprod products...')
    const res = await fetchDtoneProductsPage({
      apiKey: process.env.DTONE_API_KEY,
      apiSecret: process.env.DTONE_API_SECRET,
      baseUrl: 'https://preprod-dvs-api.dtone.com'
    }, { page: 1, perPage: 100 })
    
    console.log('Page 1 result summary:')
    console.log(`- Items count: ${res.items.length}`)
    console.log(`- Total pages: ${res.totalPages}`)
    console.log(`- Total items: ${res.total}`)
  } catch (error) {
    console.error('Fetch failed:', error)
  }
}

run()
