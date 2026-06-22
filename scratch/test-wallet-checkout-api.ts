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
  console.log('--- 1. Fetching a test plan from database ---')
  const plansRes = await supabaseRest('internal_plans?limit=1')
  const plans = await plansRes.json() as any[]
  if (plans.length === 0) {
    console.error('No internal plans found in database')
    return
  }
  const plan = plans[0]
  console.log(`Plan ID: ${plan.id}`)
  console.log(`Operator ID: ${plan.operator_ref}`)
  console.log(`Country ID: ${plan.country_iso3}`)

  console.log('\n--- 2. Fetching test user (john) profile ---')
  const profilesRes = await supabaseRest('profiles?email=eq.satyabhaskargandham@gmail.com&select=id,name,email,currency')
  const john = (await profilesRes.json() as any[])[0]
  if (!john) {
    console.error('John user profile not found')
    return
  }
  console.log(`User ID: ${john.id}, Currency: ${john.currency}`)

  console.log('\n--- 3. Ensure john has enough wallet balance in INR ---')
  const walletsRes = await supabaseRest(`wallets?user_id=eq.${john.id}&currency=eq.INR`)
  const wallet = (await walletsRes.json() as any[])[0]
  console.log('Current INR Wallet:', wallet)
  if (!wallet || Number(wallet.balance) < 500) {
    console.log('Inserting topup of 1000 INR...')
    await supabaseRest('transactions', {
      method: 'POST',
      body: JSON.stringify([{
        user_id: john.id,
        type: 'topup',
        amount: 1000,
        currency: 'INR',
        status: 'completed',
        description: 'Mock topup for testing checkout'
      }])
    })
    const walletsUpdatedRes = await supabaseRest(`wallets?user_id=eq.${john.id}&currency=eq.INR`)
    console.log('Updated Wallet:', (await walletsUpdatedRes.json() as any[])[0])
  }

  const host = 'http://localhost:3000'
  const checkoutUrl = `${host}/api/payment/wallet/checkout`

  console.log('\n--- 4. Setting wallet max consumption to 60% and trying checkout ---')
  await supabaseRest('app_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ key: 'wallet_max_consumption_percentage', value: 60, updated_at: new Date().toISOString() }]),
  })

  console.log('Executing checkout (60% limit, paying 50 INR)...')
  let res60 = await fetch(checkoutUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': john.id,
      'x-user-email': john.email,
      'x-user-name': john.name,
      'x-user-role': 'user'
    },
    body: JSON.stringify({
      planId: plan.id,
      mobileNumber: '+919876543210',
      operatorId: plan.operator_ref,
      countryId: plan.country_iso3 || 'IND',
      amount: 50,
      currency: 'INR',
    })
  })
  console.log('Status (expecting 400):', res60.status)
  console.log('Body:', await res60.json())

  console.log('\n--- 5. Setting wallet max consumption to 100% and trying checkout ---')
  await supabaseRest('app_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ key: 'wallet_max_consumption_percentage', value: 100, updated_at: new Date().toISOString() }]),
  })

  console.log('Executing checkout (100% limit, paying 50 INR)...')
  let res100 = await fetch(checkoutUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': john.id,
      'x-user-email': john.email,
      'x-user-name': john.name,
      'x-user-role': 'user'
    },
    body: JSON.stringify({
      planId: plan.id,
      mobileNumber: '+919876543210',
      operatorId: plan.operator_ref,
      countryId: plan.country_iso3 || 'IND',
      amount: 50,
      currency: 'INR',
    })
  })
  console.log('Status (expecting 200/500 depending on provider mock connectivity):', res100.status)
  console.log('Body:', await res100.json())
}

main().catch(console.error)
