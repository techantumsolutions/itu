import * as fs from 'fs'
import * as path from 'path'

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      const key = match[1]
      let value = match[2] || ''
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

loadEnv()

// Do not hardcode keys — set DING_API_KEY in .env
process.env.DING_API_BASE_URL = process.env.DING_API_BASE_URL || 'https://api.dingconnect.com'

if (!process.env.DING_API_KEY?.trim()) {
  console.error('DING_API_KEY is required (set it in .env)')
  process.exit(1)
}

import { getCountries, getProducts } from '../lib/api/ding-connect'

async function run() {
  console.log('--- TESTING DING CONNECT API ---')
  console.log('DING_API_KEY: [set]')

  try {
    console.log('1. Fetching countries...')
    const countries = await getCountries()
    console.log(`Successfully fetched ${countries.length} countries.`)
    if (countries.length > 0) {
      console.log(
        'First 5 countries:',
        countries.slice(0, 5).map((c) => c.CountryIso),
      )
    }

    console.log('\n2. Fetching products without query parameters (all products)...')
    try {
      const allProducts = await getProducts()
      console.log(`Success! Fetched ${allProducts.length} products without parameters.`)
    } catch (err: any) {
      console.error('getProducts failed:', err?.message || err)
    }
  } catch (err: any) {
    console.error('Error:', err?.message || err)
    process.exit(1)
  }
}

void run()
