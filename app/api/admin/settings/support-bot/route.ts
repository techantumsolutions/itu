import { NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/auth/require-admin-feature'
import { logAdminActivity } from '@/lib/auth/audit'
import {
  createSupportBotQa,
  deleteSupportBotQa,
  listSupportBotQa,
  updateSupportBotQa,
  validateSupportBotQaInput,
} from '@/lib/support-bot/qa'

export async function GET(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.view')
  if (denied) return denied

  try {
    const items = await listSupportBotQa()
    return NextResponse.json({ items })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load support bot Q&A' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.edit')
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const parsed = validateSupportBotQaInput(body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const item = await createSupportBotQa(parsed)
    await logAdminActivity({
      action: 'Create Support Bot Q&A',
      pageName: 'Settings — Support Bot',
      details: { id: item.id, question: item.question, category: item.category },
    })
    return NextResponse.json({ item })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create Q&A' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.edit')
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({}))
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const parsed = validateSupportBotQaInput(body)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }
    const item = await updateSupportBotQa(id, parsed)
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await logAdminActivity({
      action: 'Update Support Bot Q&A',
      pageName: 'Settings — Support Bot',
      details: { id: item.id, question: item.question },
    })
    return NextResponse.json({ item })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update Q&A' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdminPermission(request, 'settings.edit')
  if (denied) return denied

  try {
    const url = new URL(request.url)
    const id = url.searchParams.get('id')?.trim() || ''
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const ok = await deleteSupportBotQa(id)
    if (!ok) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })

    await logAdminActivity({
      action: 'Delete Support Bot Q&A',
      pageName: 'Settings — Support Bot',
      details: { id },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to delete Q&A' },
      { status: 500 },
    )
  }
}
