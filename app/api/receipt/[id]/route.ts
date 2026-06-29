import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { getOrderDb } from '@/lib/topup/orders-db'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const order = await getOrderDb(id)
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([595.28, 841.89]) // A4 in points
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const marginX = 44
    let y = 800

    page.drawText('ITU Top-Up Receipt', { x: marginX, y, size: 18, font: fontBold, color: rgb(0, 0, 0) })
    y -= 26
    page.drawText(`Reference: ${order.id}`, { x: marginX, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) })
    y -= 16
    page.drawText(`Date: ${new Date(order.created_at).toLocaleString()}`, {
      x: marginX,
      y,
      size: 11,
      font,
      color: rgb(0.15, 0.15, 0.15),
    })

    const serviceFee = (order.service_fee ?? order.fee) + (order.tax ?? 0)

    y -= 32
    const rows: Array<[string, string]> = [
      ['Phone number', order.phone_number],
      ['Country', order.country],
      ['Operator', order.operator],
      ['Original Plan Price', `${order.amount.toFixed(2)} ${order.currency}`],
      ['Service Fee', `${serviceFee.toFixed(2)} ${order.currency}`],
      ['Total Cost', `${order.total.toFixed(2)} ${order.currency}`],
      ['Status', order.status],
      ['Gateway', order.payment_gateway ?? '—'],
    ]

    const col1 = 170
    const col2 = 320
    const rowH = 22

    // Header bar
    page.drawRectangle({ x: marginX, y: y - 4, width: 510, height: rowH + 10, color: rgb(0.1, 0.12, 0.44) })
    page.drawText('Field', { x: marginX + 10, y: y + 6, size: 10, font: fontBold, color: rgb(1, 1, 1) })
    page.drawText('Value', { x: marginX + col1, y: y + 6, size: 10, font: fontBold, color: rgb(1, 1, 1) })

    y -= rowH + 14
    for (const [k, v] of rows) {
      page.drawRectangle({
        x: marginX,
        y: y - 4,
        width: 510,
        height: rowH + 8,
        borderColor: rgb(0.88, 0.88, 0.9),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      })
      page.drawText(k, { x: marginX + 10, y: y + 6, size: 10, font, color: rgb(0.2, 0.2, 0.2) })
      page.drawText(v, { x: marginX + col1, y: y + 6, size: 10, font, color: rgb(0.05, 0.05, 0.05) })
      y -= rowH + 10
    }

    const pdf = await pdfDoc.save()
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename=\"receipt-${order.id}.pdf\"`,
      },
    })
  } catch (error) {
    console.error('receipt:', error)
    return NextResponse.json({ error: 'Failed to generate receipt' }, { status: 500 })
  }
}

