import { supabaseRest } from '../lib/db/supabase-rest'
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

async function main() {
  console.log('Seeding provider catalog profiles...')
  const profiles = [
    { provider_code: 'DTONE', supported_categories: ['airtime', 'data', 'voice', 'sms', 'bundle'] },
    { provider_code: 'DING', supported_categories: ['airtime', 'data', 'voice', 'sms', 'bundle'] },
    { provider_code: 'VALUETOPUP', supported_categories: ['airtime', 'data', 'voice', 'sms', 'bundle'] },
  ]

  for (const profile of profiles) {
    const res = await supabaseRest('provider_catalog_profiles?on_conflict=provider_code', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(profile),
    })
    console.log(`Seeded profile for ${profile.provider_code}: ${res.status} ${res.statusText}`)
  }

  console.log('Seeding telecom reference catalog...')
  const referenceOperators = [
    { operator_name: 'MTN', country_code: '*' },
    { operator_name: 'ORANGE', country_code: '*' },
    { operator_name: 'AIRTEL', country_code: '*' },
    { operator_name: 'VODAFONE', country_code: '*' },
    { operator_name: 'ZAIN', country_code: '*' },
    { operator_name: 'ROBI', country_code: '*' },
    { operator_name: 'TIGO', country_code: '*' },
    { operator_name: 'CLARO', country_code: '*' },
    { operator_name: 'DIGICEL', country_code: '*' },
    { operator_name: 'FLOW', country_code: '*' },
    { operator_name: 'JAZZ', country_code: '*' },
    { operator_name: 'GRAMEENPHONE', country_code: '*' },
    { operator_name: 'OOREDOO', country_code: '*' },
    { operator_name: 'TELCEL', country_code: '*' },
    { operator_name: 'MOVISTAR', country_code: '*' },
    { operator_name: 'RELIANCE JIO', country_code: '*' },
    { operator_name: 'VI', country_code: '*' },
    { operator_name: 'JIO', country_code: '*' },
    { operator_name: 'BSNL', country_code: '*' },
    { operator_name: '9MOBILE', country_code: '*' },
    { operator_name: 'ETISALAT', country_code: '*' },
    { operator_name: 'GLOBE', country_code: '*' },
    { operator_name: 'IDEA', country_code: '*' },
    { operator_name: 'VINA PHONE', country_code: '*' },
    { operator_name: 'VINAPHONE', country_code: '*' },
    { operator_name: 'MOBIFONE', country_code: '*' },
    { operator_name: 'DIGI', country_code: '*' },
    { operator_name: 'MTNL', country_code: '*' },
    { operator_name: 'GLO', country_code: '*' },
    { operator_name: 'HUTCHISON', country_code: '*' },
    { operator_name: 'DIGIMOBIL', country_code: '*' },
    { operator_name: 'MASMOVIL', country_code: '*' },
    { operator_name: 'EUSKATEL', country_code: '*' },
    { operator_name: 'UFONE', country_code: '*' },
    { operator_name: 'TELENOR', country_code: '*' },
    { operator_name: 'VIETTEL', country_code: '*' },
    { operator_name: 'VIETTEL MOBILE', country_code: '*' },
    { operator_name: 'AWCC', country_code: '*' },
    { operator_name: 'BMOBILE', country_code: '*' },
    { operator_name: 'SMART', country_code: '*' },
  ]

  for (const op of referenceOperators) {
    const res = await supabaseRest('telecom_reference_catalog?on_conflict=operator_name,country_code', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(op),
    })
    console.log(`Seeded reference operator ${op.operator_name}: ${res.status} ${res.statusText}`)
  }

  console.log('Seeding completed successfully!')
}

main().catch(console.error)
