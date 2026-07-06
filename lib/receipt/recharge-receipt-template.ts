import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { RechargeReceiptData } from '@/lib/receipt/recharge-receipt-data'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 42
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const COLORS = {
  navy: rgb(0.043, 0.106, 0.239),
  navyLight: rgb(0.08, 0.16, 0.32),
  emerald: rgb(0.02, 0.59, 0.41),
  emeraldSoft: rgb(0.93, 0.99, 0.96),
  white: rgb(1, 1, 1),
  text: rgb(0.12, 0.14, 0.18),
  muted: rgb(0.42, 0.45, 0.5),
  border: rgb(0.88, 0.9, 0.93),
  panel: rgb(0.97, 0.98, 0.99),
  totalBg: rgb(0.95, 0.97, 1),
}

type Fonts = {
  regular: PDFFont
  bold: PDFFont
}

function formatMoney(amount: number, currency: string): string {
  // Use the currency CODE (e.g. "INR"), not the symbol — the standard PDF fonts
  // (WinAnsi) can't encode glyphs like ₹, and Intl currency style emits symbols.
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
  return `${formatted} ${(currency || '').toUpperCase()}`.trim()
}

/** Strip any characters the standard WinAnsi PDF fonts cannot encode. */
function sanitizeForPdf(text: string): string {
  // Replace common currency symbols with their codes, then drop anything non-WinAnsi.
  return (text ?? '')
    .replace(/[₹]/g, ' INR')
    .replace(/[€]/g, ' EUR')
    .replace(/[£]/g, ' GBP')
    .replace(/[^\x00-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitizeForPdf(text).split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
  }
  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function drawLabelValueRow(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  label: string,
  value: string,
  options?: { valueBold?: boolean; valueSize?: number },
): number {
  const labelSize = 9
  const valueSize = options?.valueSize ?? 10
  const valueFont = options?.valueBold ? fonts.bold : fonts.regular
  const rowHeight = 18

  page.drawText(sanitizeForPdf(label), {
    x: MARGIN_X + 14,
    y,
    size: labelSize,
    font: fonts.regular,
    color: COLORS.muted,
  })

  const valueLines = wrapText(value, valueFont, valueSize, CONTENT_WIDTH * 0.55)
  let valueY = y
  for (const line of valueLines) {
    page.drawText(line, {
      x: MARGIN_X + CONTENT_WIDTH * 0.42,
      y: valueY,
      size: valueSize,
      font: valueFont,
      color: COLORS.text,
    })
    valueY -= rowHeight - 4
  }

  return y - Math.max(rowHeight, valueLines.length * (rowHeight - 4) + 2)
}

function drawSectionTitle(page: PDFPage, fonts: Fonts, y: number, title: string): number {
  page.drawText(title.toUpperCase(), {
    x: MARGIN_X + 14,
    y,
    size: 8,
    font: fonts.bold,
    color: COLORS.navy,
  })
  return y - 18
}

function drawSectionBox(page: PDFPage, topY: number, bottomY: number) {
  // Border only — no fill, otherwise it paints over text already drawn inside it.
  page.drawRectangle({
    x: MARGIN_X,
    y: bottomY,
    width: CONTENT_WIDTH,
    height: topY - bottomY,
    borderColor: COLORS.border,
    borderWidth: 1,
  })
}

function drawSummaryLine(
  page: PDFPage,
  fonts: Fonts,
  y: number,
  label: string,
  value: string,
  options?: { bold?: boolean; accent?: boolean },
) {
  const font = options?.bold ? fonts.bold : fonts.regular
  const size = options?.bold ? 11 : 10
  const safeValue = sanitizeForPdf(value)
  page.drawText(sanitizeForPdf(label), {
    x: MARGIN_X + 14,
    y,
    size,
    font,
    color: options?.accent ? COLORS.navy : COLORS.text,
  })
  const valueWidth = font.widthOfTextAtSize(safeValue, size)
  page.drawText(safeValue, {
    x: MARGIN_X + CONTENT_WIDTH - 14 - valueWidth,
    y,
    size,
    font,
    color: options?.accent ? COLORS.navy : COLORS.text,
  })
}

export async function generateRechargeReceiptPdf(data: RechargeReceiptData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  }

  // Header band
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 118,
    width: PAGE_WIDTH,
    height: 118,
    color: COLORS.navy,
  })

  page.drawText('ITU', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 52,
    size: 28,
    font: fonts.bold,
    color: COLORS.white,
  })
  page.drawText('International Top-Up Union', {
    x: MARGIN_X,
    y: PAGE_HEIGHT - 72,
    size: 10,
    font: fonts.regular,
    color: rgb(0.82, 0.86, 0.94),
  })

  page.drawText('RECHARGE RECEIPT', {
    x: PAGE_WIDTH - MARGIN_X - fonts.bold.widthOfTextAtSize('RECHARGE RECEIPT', 12),
    y: PAGE_HEIGHT - 54,
    size: 12,
    font: fonts.bold,
    color: COLORS.white,
  })
  page.drawText('Official transaction record', {
    x: PAGE_WIDTH - MARGIN_X - fonts.regular.widthOfTextAtSize('Official transaction record', 9),
    y: PAGE_HEIGHT - 70,
    size: 9,
    font: fonts.regular,
    color: rgb(0.82, 0.86, 0.94),
  })

  // Receipt meta strip
  let y = PAGE_HEIGHT - 148
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 34,
    width: CONTENT_WIDTH,
    height: 52,
    color: COLORS.panel,
    borderColor: COLORS.border,
    borderWidth: 1,
  })

  page.drawText('Receipt No.', {
    x: MARGIN_X + 14,
    y: y - 4,
    size: 8,
    font: fonts.regular,
    color: COLORS.muted,
  })
  page.drawText(data.receiptNumber, {
    x: MARGIN_X + 14,
    y: y - 18,
    size: 12,
    font: fonts.bold,
    color: COLORS.text,
  })

  page.drawText('Date & Time', {
    x: MARGIN_X + 170,
    y: y - 4,
    size: 8,
    font: fonts.regular,
    color: COLORS.muted,
  })
  page.drawText(formatDateTime(data.issuedAt), {
    x: MARGIN_X + 170,
    y: y - 18,
    size: 10,
    font: fonts.bold,
    color: COLORS.text,
  })

  const statusColor = data.status === 'paid' ? COLORS.emerald : data.status === 'failed' ? rgb(0.8, 0.2, 0.2) : rgb(0.85, 0.55, 0.1)
  const statusBg = data.status === 'paid' ? COLORS.emeraldSoft : COLORS.panel
  const statusX = MARGIN_X + CONTENT_WIDTH - 96
  page.drawRectangle({
    x: statusX,
    y: y - 26,
    width: 82,
    height: 28,
    color: statusBg,
    borderColor: statusColor,
    borderWidth: 1,
  })
  const statusText = data.statusLabel.toUpperCase()
  const statusTextWidth = fonts.bold.widthOfTextAtSize(statusText, 10)
  page.drawText(statusText, {
    x: statusX + (82 - statusTextWidth) / 2,
    y: y - 18,
    size: 10,
    font: fonts.bold,
    color: statusColor,
  })

  // Recharge details section
  y -= 72
  const rechargeSectionTop = y + 14
  y = drawSectionTitle(page, fonts, y, 'Recharge Details')
  

  const rechargeRows: Array<[string, string, boolean?]> = [
    ['Mobile Number', data.mobileNumber, true],
    ['Operator', data.operator],
    ['Country', data.countryName !== '—' ? `${data.countryName} (${data.countryCode})` : '—'],
    ['Plan Name', data.planName, true],
    ['Plan Value', data.planValue],
    ['Plan ID', data.planId],
  ]

  for (const [label, value, bold] of rechargeRows) {
    y = drawLabelValueRow(page, fonts, y, label, value, { valueBold: Boolean(bold) })
  }

  drawSectionBox(page, rechargeSectionTop, y - 8)

  // Payment summary section
  y -= 34
  const paymentSectionTop = y + 14
  y = drawSectionTitle(page, fonts, y, 'Payment Summary')


  drawSummaryLine(page, fonts, y, 'Plan Price', formatMoney(data.planPrice, data.planPriceCurrency))
  y -= 18
  drawSummaryLine(page, fonts, y, 'Service Fee', formatMoney(data.serviceFee, data.paymentCurrency))
  y -= 18
  drawSummaryLine(page, fonts, y, 'Tax', formatMoney(data.tax, data.paymentCurrency))
  y -= 14

  page.drawLine({
    start: { x: MARGIN_X + 14, y },
    end: { x: MARGIN_X + CONTENT_WIDTH - 14, y },
    thickness: 1,
    color: COLORS.border,
  })
  y -= 20

  page.drawRectangle({
    x: MARGIN_X + 10,
    y: y - 8,
    width: CONTENT_WIDTH - 20,
    height: 30,
    color: COLORS.totalBg,
    borderColor: COLORS.border,
    borderWidth: 1,
  })
  drawSummaryLine(page, fonts, y + 2, 'Total Paid', formatMoney(data.totalPaid, data.paymentCurrency), {
    bold: true,
    accent: true,
  })
  y -= 28

  drawSummaryLine(page, fonts, y, 'Payment Method', data.paymentMethod)
  y -= 18
  drawSummaryLine(page, fonts, y, 'Paid Currency', data.paymentCurrency)

  drawSectionBox(page, paymentSectionTop, y - 12)

  // Reference block
  y -= 34
  page.drawRectangle({
    x: MARGIN_X,
    y: y - 54,
    width: CONTENT_WIDTH,
    height: 68,
    color: COLORS.panel,
    borderColor: COLORS.border,
    borderWidth: 1,
  })

  page.drawText('Transaction References', {
    x: MARGIN_X + 14,
    y: y - 2,
    size: 8,
    font: fonts.bold,
    color: COLORS.navy,
  })

  let refY = y - 20
  if (data.transactionId) {
    page.drawText(sanitizeForPdf(`Transaction ID: ${data.transactionId}`), {
      x: MARGIN_X + 14,
      y: refY,
      size: 9,
      font: fonts.regular,
      color: COLORS.text,
    })
    refY -= 14
  }
  if (data.providerRef) {
    page.drawText(sanitizeForPdf(`Provider Reference: ${data.providerRef}`), {
      x: MARGIN_X + 14,
      y: refY,
      size: 9,
      font: fonts.regular,
      color: COLORS.text,
    })
    refY -= 14
  }
  if (data.providerName) {
    page.drawText(sanitizeForPdf(`Provider: ${data.providerName}`), {
      x: MARGIN_X + 14,
      y: refY,
      size: 9,
      font: fonts.regular,
      color: COLORS.text,
    })
  }

  // Footer
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: 72,
    color: COLORS.navyLight,
  })
  page.drawText('Thank you for using ITU', {
    x: MARGIN_X,
    y: 44,
    size: 11,
    font: fonts.bold,
    color: COLORS.white,
  })
  page.drawText('This is a computer-generated receipt and does not require a signature.', {
    x: MARGIN_X,
    y: 28,
    size: 8,
    font: fonts.regular,
    color: rgb(0.78, 0.82, 0.9),
  })
  page.drawText('For support, visit your account or contact ITU customer service.', {
    x: MARGIN_X,
    y: 14,
    size: 8,
    font: fonts.regular,
    color: rgb(0.78, 0.82, 0.9),
  })

  return pdfDoc.save()
}
