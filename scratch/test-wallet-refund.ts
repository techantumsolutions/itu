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
  if (!profilesRes.ok) {
    console.error('Failed to get user profile')
    return
  }
  const profiles = await profilesRes.json() as any[]
  if (profiles.length === 0) {
    console.log('No profiles found')
    return
  }
  const targetUser = profiles[0]
  console.log(`Testing with user: ${targetUser.email} (ID: ${targetUser.id})`)

  // Check their current wallet
  const walletRes = await supabaseRest(`wallets?user_id=eq.${targetUser.id}`)
  if (!walletRes.ok) {
    console.error('Failed to get wallet info:', await walletRes.text())
    return
  }
  let wallets = await walletRes.json() as any[]
  let wallet = wallets[0]
  if (!wallet) {
    console.log('No wallet found, creating one...')
    const createRes = await supabaseRest('wallets', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ user_id: targetUser.id, currency: 'USD', balance: 0 }]),
    })
    const created = await createRes.json()
    wallet = created[0]
  }
  console.log(`Original wallet balance: ${wallet.balance}`)

  // Create a transaction of type 'refund'
  const refundAmount = 5.0
  console.log(`Inserting refund transaction of ${refundAmount} USD...`)
  const txRes = await supabaseRest('transactions?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        user_id: targetUser.id,
        wallet_id: wallet.id,
        type: 'refund',
        amount: refundAmount,
        currency: 'USD',
        status: 'completed',
        description: 'Test refund transaction'
      }
    ])
  })

  if (!txRes.ok) {
    console.error('Failed to insert transaction:', await txRes.text())
    return
  }

  const txs = await txRes.json() as any[]
  console.log(`Transaction inserted successfully, ID: ${txs[0].id}`)

  // Retrieve wallet balance again
  const walletRes2 = await supabaseRest(`wallets?user_id=eq.${targetUser.id}`)
  const wallets2 = await walletRes2.json() as any[]
  console.log(`New wallet balance: ${wallets2[0].balance}`)
}

test().catch(console.error)
