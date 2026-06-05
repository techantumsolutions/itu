import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggAudit } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await adminCanUseFeature(request, 'integrations', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await request.json().catch(() => ({}))
  const { action, classification } = body // action: 'APPROVE' | 'REJECT', classification: override classification target

  if (action !== 'APPROVE' && action !== 'REJECT') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // 1. Get review queue item
  const itemRes = await supabaseRest(`classification_review_queue?id=eq.${encodeURIComponent(id)}&limit=1`, { cache: 'no-store' })
  if (!itemRes.ok) {
    return NextResponse.json({ error: 'Review queue item not found' }, { status: 404 })
  }
  const items = await itemRes.json()
  const item = items[0]
  if (!item) {
    return NextResponse.json({ error: 'Review queue item not found' }, { status: 404 })
  }

  const targetClassification = classification || (action === 'APPROVE' ? (item.entity_type === 'operator' ? 'TELECOM' : 'AIRTIME') : 'REJECTED')

  // 2. Create rule for learning capability
  const ruleRes = await supabaseRest('classification_rules?on_conflict=pattern,match_type,entity_type', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      pattern: item.entity_name.trim().toUpperCase(),
      match_type: 'EXACT',
      entity_type: item.entity_type,
      classification: targetClassification,
      is_active: true
    })
  })

  // 3. Update status of the review queue item
  const updateRes = await supabaseRest(`classification_review_queue?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      notes: `Manually processed. Created rule pattern: ${item.entity_name.trim().toUpperCase()} -> ${targetClassification}`,
      updated_at: new Date().toISOString()
    })
  })

  if (!updateRes.ok) {
    return NextResponse.json({ error: 'Failed to update review queue status' }, { status: 500 })
  }

  const updatedItem = (await updateRes.json())[0]

  // 4. Log audit event
  const actor = getRequestUser(request)
  await aggAudit({
    actor: actor?.email ?? 'admin',
    action: `review_queue.${action.toLowerCase()}`,
    entityType: 'classification_review_queue',
    entityId: id,
    before: item,
    after: updatedItem,
    details: { classification: targetClassification }
  }).catch(() => {})

  return NextResponse.json({ success: true, item: updatedItem })
}
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return POST(request, ctx)
}
