import { NextResponse } from 'next/server'
import { getAuthenticatedRequestUser } from '@/lib/tickets/auth-headers'
import { getUserWalletBalances } from '@/lib/wallet/balance/get-user-wallets'

export async function GET(request: Request) {
  const user = await getAuthenticatedRequestUser(request)
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await getUserWalletBalances(user.id)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({
      balance: result.balance,
      currency: result.currency,
      maxConsumptionPercentage: result.maxConsumptionPercentage,
      wallets: result.wallets,
    })
  } catch (error) {
    console.error('Failed to get wallet balance:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
