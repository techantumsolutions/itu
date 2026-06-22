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

async function test() {
  // Let's find a user from profiles
  const profilesRes = await supabaseRest('profiles?limit=1')
  const profiles = await profilesRes.json() as any[]
  const targetUser = profiles[0]
  console.log(`Testing with user: ${targetUser.email} (ID: ${targetUser.id})`)

  // Check their current wallet
  const walletRes = await supabaseRest(`wallets?user_id=eq.${targetUser.id}`)
  const wallets = await walletRes.json() as any[]
  let wallet = wallets[0]
  console.log(`Original wallet balance: ${wallet?.balance}`)

  // Top up via REST or direct?
  // Let's do a top-up POST to /api/wallet/topup... wait, we can just run it using fetch and the user headers.
  // Wait, let's see what happens if we simulate a transaction insert for topup.
  const amount = 10.0
  console.log(`Inserting topup transaction of ${amount} USD...`)
  const txRes = await supabaseRest('transactions?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        user_id: targetUser.id,
        type: 'topup',
        amount: amount,
        currency: 'USD',
        status: 'completed',
        description: 'Wallet top-up'
      }
    ])
  })
  if (!txRes.ok) {
    console.error('Failed to insert transaction:', await txRes.text())
    return
  }
  console.log('Transaction inserted successfully')

  // Check wallet balance again
  const walletRes2 = await supabaseRest(`wallets?user_id=eq.${targetUser.id}`)
  const wallets2 = await walletRes2.json() as any[]
  console.log(`New wallet balance after topup insert: ${wallets2[0]?.balance}`)
}

test().catch(console.error)
