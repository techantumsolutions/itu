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

async function check() {
  console.log('=== CHECKING ALL WALLETS ===')
  const walletsRes = await supabaseRest('wallets?select=id,user_id,balance,currency&order=balance.desc')
  const wallets = await walletsRes.json() as any[]
  console.log(`Total wallets: ${wallets.length}`)
  for (const w of wallets) {
    // fetch profile name
    const pRes = await supabaseRest(`profiles?id=eq.${w.user_id}&select=name,email`)
    const profiles = await pRes.json() as any[]
    const p = profiles[0]
    console.log(`  User: ${p?.name ?? 'Unknown'} (${p?.email ?? '—'}) | Balance: ${w.balance} ${w.currency} | Wallet ID: ${w.id}`)
  }

  console.log('\n=== CHECKING REFUND TRANSACTIONS ===')
  const refundTxRes = await supabaseRest('transactions?type=eq.refund&select=id,user_id,amount,currency,status,created_at&order=created_at.desc&limit=10')
  const refundTxs = await refundTxRes.json() as any[]
  console.log(`Refund transactions: ${refundTxs.length}`)
  for (const tx of refundTxs) {
    console.log(`  Tx: ${tx.id} | User: ${tx.user_id} | Amount: ${tx.amount} ${tx.currency} | Status: ${tx.status}`)
  }

  console.log('\n=== CHECKING REFUNDS TABLE ===')
  const refundsRes = await supabaseRest('refunds?select=id,transaction_id,amount,currency,status,reason&order=created_at.desc&limit=10')
  const refunds = await refundsRes.json() as any[]
  console.log(`Refunds entries: ${refunds.length}`)
  for (const r of refunds) {
    console.log(`  Refund: ${r.id} | Original Tx: ${r.transaction_id} | Amount: ${r.amount} ${r.currency} | Status: ${r.status}`)
  }
}

check().catch(console.error)
