import { NextResponse } from 'next/server'
import { getUserIdFromRequest } from '@/lib/auth/get-user-id-from-request'
import { adminHasPermission } from '@/lib/auth/require-admin-permission'
import { loadRechargeReceiptData } from '@/lib/receipt/recharge-receipt-data'
import { generateRechargeReceiptPdf } from '@/lib/receipt/recharge-receipt-template'

/**
 * PDF receipt for a recharge order.
 * Access: owner (receipt.userId === authenticated user) OR admin with transactions.view.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getUserIdFromRequest(request)
    const canViewAsAdmin = await adminHasPermission(request, 'transactions.view')
    if (!userId && !canViewAsAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const receipt = await loadRechargeReceiptData(id)
    if (!receipt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // IDOR guard: non-admins may only download their own receipt.
    if (!canViewAsAdmin) {
      if (!userId || !receipt.userId || receipt.userId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    if (receipt.status !== 'paid') {
      return NextResponse.json(
        { error: 'Receipt not available until payment succeeds' },
        { status: 403 },
      )
    }

    const pdf = await generateRechargeReceiptPdf(receipt)
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="itu-receipt-${receipt.receiptNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('receipt:', error)
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 })
  }
}
