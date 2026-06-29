import { supabaseRest } from '@/lib/db/supabase-rest'
import { convertUsingEurBaseRates } from '@/lib/topup/currency-conversion'

interface RewardRule {
  id: string
  name: string
  trigger: 'FIRST_RECHARGE' | 'MIN_AMOUNT' | 'RECHARGE_COUNT'
  points: number
  currency?: string
  scope: {
    min_amount?: number
    recharge_count?: number
    [key: string]: any
  }
  is_active: boolean
}

interface TransactionRow {
  id: string
  user_id: string | null
  type: string
  amount: number
  currency: string
  status: string
}

/**
 * Processes loyalty reward points for a completed recharge transaction.
 * Governed by admin rules in the reward_rules table.
 */
export async function processRewardsForTransaction(transactionId: string): Promise<void> {
  console.log(`[REWARDS] Processing rewards for transaction: ${transactionId}`)
  try {
    // 1. Fetch transaction details
    const txRes = await supabaseRest(`transactions?id=eq.${encodeURIComponent(transactionId)}&select=id,user_id,type,amount,currency,status&limit=1`, { cache: 'no-store' })
    if (!txRes.ok) {
      console.error(`[REWARDS] Transaction ${transactionId} not found`)
      return
    }
    const txRows = (await txRes.json()) as TransactionRow[]
    const txn = txRows[0]
    if (!txn) {
      console.error(`[REWARDS] Transaction ${transactionId} row is empty`)
      return
    }

    // Only award points for completed recharge transactions belonging to a registered user
    if (txn.status !== 'completed' || txn.type !== 'recharge' || !txn.user_id) {
      console.log(`[REWARDS] Transaction ${transactionId} is ineligible. Status: ${txn.status}, Type: ${txn.type}, UserID: ${txn.user_id}`)
      return
    }

    const userId = txn.user_id

    // 2. Fetch active reward rules
    const rulesRes = await supabaseRest('reward_rules?is_active=eq.true', { cache: 'no-store' })
    if (!rulesRes.ok) {
      console.error('[REWARDS] Failed to fetch reward rules')
      return
    }
    const activeRules = (await rulesRes.json()) as RewardRule[]
    if (activeRules.length === 0) {
      console.log('[REWARDS] No active reward rules found')
      return
    }

    // 3. Fetch recharge history count for this user (completed only)
    const historyRes = await supabaseRest(`transactions?user_id=eq.${encodeURIComponent(userId)}&status=eq.completed&type=eq.recharge&select=id`, { cache: 'no-store' })
    if (!historyRes.ok) {
      console.error(`[REWARDS] Failed to fetch recharge history for user: ${userId}`)
      return
    }
    const historyRows = (await historyRes.json()) as Array<{ id: string }>
    const rechargeCount = historyRows.length

    console.log(`[REWARDS] User ${userId} has ${rechargeCount} completed recharges including this one.`)

    // 4. Evaluate each rule and collect all qualified candidates
    const qualifiedRules: Array<{ rule: RewardRule; reason: string }> = []

    for (const rule of activeRules) {
      let qualified = false
      let reason = ''

      if (rule.trigger === 'FIRST_RECHARGE') {
        if (rechargeCount === 1) {
          qualified = true
          reason = `First Recharge Bonus: ${rule.name}`
        }
      } else if (rule.trigger === 'MIN_AMOUNT') {
        const minAmount = rule.scope?.min_amount ?? 0
        let targetMinAmount = minAmount
        const ruleCurrency = (rule.currency || 'USD').trim().toUpperCase()
        const txnCurrency = (txn.currency || 'USD').trim().toUpperCase()
        if (ruleCurrency !== txnCurrency) {
          const rateRes = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' }).catch(() => null)
          if (rateRes?.ok) {
            const rateData = await rateRes.json()
            const rates = rateData?.rates
            if (rates) {
              const converted = convertUsingEurBaseRates(minAmount, ruleCurrency, txnCurrency, rates)
              if (converted !== null) {
                targetMinAmount = converted
              }
            }
          }
        }
        if (txn.amount >= targetMinAmount) {
          qualified = true
          reason = `Min Amount Recharge (${txn.amount} >= ${targetMinAmount.toFixed(2)} ${txnCurrency}): ${rule.name}`
        }
      } else if (rule.trigger === 'RECHARGE_COUNT') {
        const targetCount = rule.scope?.recharge_count ?? 1
        if (rechargeCount > 0 && rechargeCount % targetCount === 0) {
          qualified = true
          reason = `Recharge Count Loyalty (${rechargeCount} is multiple of ${targetCount}): ${rule.name}`
        }
      }

      if (qualified) {
        qualifiedRules.push({ rule, reason })
        console.log(`[REWARDS] User ${userId} qualified for rule: ${rule.name} (+${rule.points} pts)`)
      }
    }

    if (qualifiedRules.length === 0) {
      console.log(`[REWARDS] User ${userId} did not qualify for any reward rules.`)
      return
    }

    // 5. Pick only the single best rule (highest points). If tied, first match wins.
    qualifiedRules.sort((a, b) => b.rule.points - a.rule.points)
    const best = qualifiedRules[0]

    console.log(`[REWARDS] User ${userId} qualified for ${qualifiedRules.length} rule(s). Awarding best: "${best.rule.name}" (+${best.rule.points} pts)`)
    if (qualifiedRules.length > 1) {
      const skipped = qualifiedRules.slice(1).map(q => `${q.rule.name} (${q.rule.points} pts)`).join(', ')
      console.log(`[REWARDS] Skipped lower-value rules: ${skipped}`)
    }

    // 6. Award the best rule
    const ledgerRes = await supabaseRest('reward_ledger', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        transaction_id: transactionId,
        points: best.rule.points,
        reason: best.reason,
        metadata: {
          rule_id: best.rule.id,
          trigger: best.rule.trigger,
          scope: best.rule.scope,
          all_qualified: qualifiedRules.map(q => ({ rule_id: q.rule.id, name: q.rule.name, points: q.rule.points })),
        },
      }),
    })

    if (!ledgerRes.ok) {
      console.error(`[REWARDS] Failed to write ledger entry for rule ${best.rule.id}:`, await ledgerRes.text())
      return
    }

    // Upsert points in reward_accounts
    const accountRes = await supabaseRest(`reward_accounts?user_id=eq.${encodeURIComponent(userId)}&select=points_balance&limit=1`, { cache: 'no-store' })
    let existingPoints = 0
    let hasAccount = false

    if (accountRes.ok) {
      const accRows = await accountRes.json()
      if (accRows.length > 0) {
        existingPoints = accRows[0].points_balance
        hasAccount = true
      }
    }

    const newBalance = existingPoints + best.rule.points

    let updateAccountRes
    if (hasAccount) {
      updateAccountRes = await supabaseRest(`reward_accounts?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          points_balance: newBalance,
          updated_at: new Date().toISOString(),
        }),
      })
    } else {
      updateAccountRes = await supabaseRest('reward_accounts', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          points_balance: newBalance,
        }),
      })
    }

    if (!updateAccountRes.ok) {
      console.error(`[REWARDS] Failed to update rewards balance for user ${userId}:`, await updateAccountRes.text())
    } else {
      console.log(`[REWARDS] Successfully updated user ${userId} balance from ${existingPoints} to ${newBalance} points`)
    }
  } catch (err) {
    console.error(`[REWARDS] Error processing rewards for transaction ${transactionId}:`, err)
  }
}

export async function redeemPoints(
  userId: string,
  transactionId: string | null,
  pointsToRedeem: number,
  reason: string,
): Promise<boolean> {
  console.log(`[REWARDS] Redeeming ${pointsToRedeem} points for user: ${userId}`)
  try {
    const ledgerRes = await supabaseRest('reward_ledger', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        transaction_id: transactionId || null,
        points: -pointsToRedeem,
        reason: reason,
        metadata: {
          is_redemption: true,
        },
      }),
    })
    if (!ledgerRes.ok) {
      console.error(`[REWARDS] Failed to write ledger redemption entry:`, await ledgerRes.text())
      return false
    }

    const accountRes = await supabaseRest(
      `reward_accounts?user_id=eq.${encodeURIComponent(userId)}&select=points_balance&limit=1`,
      { cache: 'no-store' }
    )
    let existingPoints = 0
    let hasAccount = false
    if (accountRes.ok) {
      const accRows = await accountRes.json()
      if (accRows.length > 0) {
        existingPoints = accRows[0].points_balance
        hasAccount = true
      }
    }

    const newBalance = Math.max(0, existingPoints - pointsToRedeem)

    let updateAccountRes
    if (hasAccount) {
      updateAccountRes = await supabaseRest(`reward_accounts?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          points_balance: newBalance,
          updated_at: new Date().toISOString(),
        }),
      })
    } else {
      updateAccountRes = await supabaseRest('reward_accounts', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          points_balance: newBalance,
        }),
      })
    }
    return updateAccountRes.ok
  } catch (err) {
    console.error(`[REWARDS] Error redeeming points for user ${userId}:`, err)
    return false
  }
}
