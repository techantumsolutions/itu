import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { aggAudit, aggUpsertOperatorMapping } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'

const mapSchema = z.object({
  serviceProviderId: z.string().uuid(),
  providerOperatorRawId: z.string().uuid(),
  systemOperatorId: z.string().uuid(),
  mappingConfidence: z.number().min(0).max(100).optional(),
  mappingType: z.enum(['AUTO', 'MANUAL', 'AI_MATCHED', 'EXACT_MATCH']).optional(),
})

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const parsed = mapSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid mapping payload', issues: parsed.error.flatten() }, { status: 400 })

  const actor = getRequestUser(request)
  const mapping = await aggUpsertOperatorMapping({
    serviceProviderId: parsed.data.serviceProviderId,
    providerOperatorRawId: parsed.data.providerOperatorRawId,
    systemOperatorId: parsed.data.systemOperatorId,
    mappingConfidence: parsed.data.mappingConfidence ?? 100,
    mappingType: parsed.data.mappingType ?? 'MANUAL',
    isVerified: true,
    verifiedBy: actor?.email ?? 'admin',
  })
  await aggAudit({
    actor: actor?.email,
    action: 'operator_mapping.approve',
    entityType: 'operator_mapping',
    entityId: mapping?.id,
    after: mapping,
  })
  return NextResponse.json({ mapping })
}
