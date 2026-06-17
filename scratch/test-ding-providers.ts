import { loadEnvConfig } from '@next/env'
const projectDir = process.cwd()
loadEnvConfig(projectDir)

import { getProviders } from './lib/api/ding-connect'

async function run() {
  const providers = await getProviders('IN')
  console.log(providers.find(p => p.ProviderCode === 'AIIN') || providers[0])
}
run()
