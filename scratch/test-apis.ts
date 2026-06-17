import { loadEnvConfig } from '@next/env'
const projectDir = process.cwd()
loadEnvConfig(projectDir)

import { getAccountLookup } from './lib/api/ding-connect'
import { fetchDtoneMobileNumberLookup } from './lib/dtone'

async function run() {
  console.log('Testing Ding Connect...')
  try {
    const ding = await getAccountLookup('+919810123456')
    console.log('Ding Result:', JSON.stringify(ding, null, 2))
  } catch (e) {
    console.error('Ding Error:', e)
  }

  console.log('\nTesting DT One...')
  try {
    const dtone = await fetchDtoneMobileNumberLookup({ mobile_number: '+919810123456' })
    console.log('DT One Result:', JSON.stringify(dtone, null, 2))
  } catch (e) {
    console.error('DT One Error:', e)
  }
}

run()
