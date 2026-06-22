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
  console.log('=== VERIFYING REFUND API END-TO-END ===')

  // 1. Get a user profile
  const profilesRes = await supabaseRest('profiles?limit=1')
  const profiles = await profilesRes.json() as any[]
  if (profiles.length === 0) {
    console.error('No profiles found')
    return
  }
  const user = profiles[0]
  console.log(`Target User: ${user.name} (${user.email}, ID: ${user.id})`)

  // 2. Fetch original wallet balance
  const walletRes = await supabaseRest(`wallets?user_id=eq.${user.id}`)
  let wallet = (await walletRes.json())[0]
  if (!wallet) {
    // create wallet
    const createRes = await supabaseRest('wallets', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{ user_id: user.id, currency: 'USD', balance: 0 }]),
    })
    wallet = (await createRes.json())[0]
  }
  const originalBalance = Number(wallet.balance)
  console.log(`Original wallet balance: ${originalBalance} USD`)

  // 3. Create a failed recharge transaction
  const amount = 25.0
  const txRes = await supabaseRest('transactions?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        user_id: user.id,
        wallet_id: wallet.id,
        type: 'recharge',
        amount,
        currency: 'USD',
        status: 'failed',
        description: 'Failed top-up recharge to be refunded',
      }
    ])
  })
  if (!txRes.ok) {
    console.error('Failed to create mock transaction:', await txRes.text())
    return
  }
  const transactionId = (await txRes.json())[0].id
  console.log(`Created failed recharge transaction ID: ${transactionId}`)

  // Create corresponding recharge order
  await supabaseRest('recharge_orders', {
    method: 'POST',
    body: JSON.stringify([
      {
        user_id: user.id,
        transaction_id: transactionId,
        phone_number: '+919999999999',
        operator_name: 'Test Operator',
        sku_code: 'test-sku',
        status: 'failed',
        send_amount: amount,
        send_currency: 'USD',
      }
    ])
  })

  // 4. Hit the Refund API endpoint
  // We determine port from local command line or try default 3000
  const port = 3000
  const refundUrl = `http://localhost:${port}/api/admin/transactions/refund`
  console.log(`Calling refund API: ${refundUrl}`)

  try {
    const res = await fetch(refundUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id,
        'x-user-email': 'admin@itu.com',
        'x-user-role': 'admin',
      },
      body: JSON.stringify({ transactionId }),
    })

    const body = await res.json()
    console.log('Response Status:', res.status)
    console.log('Response Body:', body)

    if (res.ok && body.ok) {
      console.log('API call succeeded! Verifying DB changes...')

      // Get transaction status
      const checkTx = await supabaseRest(`transactions?id=eq.${transactionId}&select=status`)
      const txStatus = (await checkTx.json())[0]?.status
      console.log(`Original Transaction Status (expected: refunded): ${txStatus}`)

      // Get new wallet balance
      const checkWallet = await supabaseRest(`wallets?user_id=eq.${user.id}`)
      const newBalance = Number((await checkWallet.json())[0]?.balance)
      console.log(`New wallet balance (expected: ${originalBalance + amount}): ${newBalance} USD`)

      // Verify refunds table entry exists
      const checkRefunds = await supabaseRest(`refunds?transaction_id=eq.${transactionId}`)
      const refundEntries = await checkRefunds.json() as any[]
      console.log(`Refund entries found in refunds table: ${refundEntries.length}`)
      let hasRefundEntry = false
      if (refundEntries.length > 0) {
        const refundEntry = refundEntries[0]
        console.log(`Refund entry ID: ${refundEntry.id}`)
        console.log(`Refund Amount in table: ${refundEntry.amount} ${refundEntry.currency}`)
        console.log(`Refund Status in table: ${refundEntry.status}`)
        console.log(`Refund Reason in table: ${refundEntry.reason}`)
        console.log(`Refund Metadata in table:`, refundEntry.metadata)
        if (Number(refundEntry.amount) === amount && refundEntry.currency === 'USD' && refundEntry.status === 'completed') {
          hasRefundEntry = true
        }
      }

      if (txStatus === 'refunded' && newBalance === (originalBalance + amount) && hasRefundEntry) {
        console.log('SUCCESS: Wallet refund verification (including refunds table entry) passed!')
      } else {
        console.error('FAILURE: DB values did not match expectations')
      }
    } else {
      console.error('API call failed:', body)
    }
  } catch (err) {
    console.error('Network error calling API:', err)
  }
}

test().catch(console.error)
