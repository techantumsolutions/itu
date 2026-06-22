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
  console.log('--- 1. Verification of app_settings table ---')
  const settingsResBefore = await supabaseRest('app_settings?key=eq.wallet_max_consumption_percentage&select=value')
  const settingsBefore = await settingsResBefore.json() as any[]
  console.log('Settings before:', settingsBefore)

  console.log('\n--- 2. Updating wallet_max_consumption_percentage to 60 ---')
  const updateRes = await supabaseRest('app_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([
      {
        key: 'wallet_max_consumption_percentage',
        value: 60,
        updated_at: new Date().toISOString(),
      },
    ]),
  })
  if (!updateRes.ok) {
    console.error('Failed to update app_settings:', await updateRes.text())
    return
  }
  console.log('Update app_settings response status:', updateRes.status)

  const settingsResAfter = await supabaseRest('app_settings?key=eq.wallet_max_consumption_percentage&select=value')
  const settingsAfter = await settingsResAfter.json() as any[]
  console.log('Settings after update:', settingsAfter)

  console.log('\n--- 3. Testing /api/wallet/balance via mock request headers ---')
  // We can query the profile of john to get his ID
  const profilesRes = await supabaseRest('profiles?email=eq.satyabhaskargandham@gmail.com&select=id,name,email,currency')
  const profiles = await profilesRes.json() as any[]
  if (profiles.length === 0) {
    console.error('Test user "john" not found')
    return
  }
  const john = profiles[0]
  console.log(`Found test user: ${john.name} (${john.email}) [ID: ${john.id}] [Currency: ${john.currency}]`)

  // Call the balance API route
  const host = 'http://localhost:3000'
  const balanceUrl = `${host}/api/wallet/balance`
  console.log(`Calling GET ${balanceUrl} with headers for john...`)
  try {
    const res = await fetch(balanceUrl, {
      headers: {
        'x-user-id': john.id,
        'x-user-email': john.email,
        'x-user-name': john.name,
        'x-user-role': 'user'
      }
    })
    console.log('Response status:', res.status)
    const data = await res.json()
    console.log('Response body:', data)
  } catch (e) {
    console.error('Failed to fetch wallet balance API:', e)
  }
}

main().catch(console.error)
