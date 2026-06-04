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

// Set the API key from database for testing
process.env.DING_API_KEY = 'KBJTB0y1UHj6p48GSsaiC4'
process.env.DING_API_BASE_URL = 'https://api.dingconnect.com'

// Now import the API client AFTER setting the env variables
// Wait, we need to see if the module evaluates them at import time.
// Since we set them before import, it should load them.
import { getCountries, getProducts } from '../lib/api/ding-connect'

async function run() {
  console.log('--- TESTING DING CONNECT API ---')
  console.log('DING_API_KEY:', process.env.DING_API_KEY)
  
  try {
    console.log('1. Fetching countries...')
    const countries = await getCountries()
    console.log(`Successfully fetched ${countries.length} countries.`)
    if (countries.length > 0) {
      console.log('First 5 countries:', countries.slice(0, 5).map(c => c.CountryIso))
    }

    console.log('\n2. Fetching products without query parameters (all products)...')
    try {
      // Let's see if we can call getProducts with no parameters
      const allProducts = await getProducts()
      console.log(`Success! Fetched ${allProducts.length} products without parameters.`)
    } catch (err: any) {
      console.log(`Failed to fetch without parameters: ${err.message}`)
    }

    console.log('\n3. Fetching products for a specific country (e.g. IN)...')
    try {
      const inProducts = await getProducts('IN')
      console.log(`Success! Fetched ${inProducts.length} products for IN.`)
    } catch (err: any) {
      console.log(`Failed for IN: ${err.message}`)
    }
  } catch (error: any) {
    console.error('Test failed:', error.message || error)
  }
}

run()
