import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { aggAudit, aggUpsertPlanMapping } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { logAdminActivity } from '@/lib/auth/audit'

const mapSchema = z.object({
  serviceProviderId: z.string().uuid(),
  providerPlanRawId: z.string().uuid(),
  systemPlanId: z.string().uuid(),
  matchingScore: z.number().min(0).max(100).optional(),
  matchingReason: z.string().optional(),
})

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const parsed = mapSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid mapping payload', issues: parsed.error.flatten() }, { status: 400 })

  const actor = getRequestUser(request)
  const mapping = await aggUpsertPlanMapping({
    serviceProviderId: parsed.data.serviceProviderId,
    providerPlanRawId: parsed.data.providerPlanRawId,
    systemPlanId: parsed.data.systemPlanId,
    matchingScore: parsed.data.matchingScore ?? 100,
    matchingReason: parsed.data.matchingReason ?? 'Manual admin mapping',
    isVerified: true,
    verifiedBy: actor?.email ?? 'admin',
  })
  await aggAudit({
    actor: actor?.email,
    action: 'plan_mapping.approve',
    entityType: 'plan_mapping',
    entityId: mapping?.id,
    after: mapping,
  })

  await logAdminActivity({
    action: 'Map Plans',
    pageName: 'Integrations',
    details: parsed.data,
  })

  return NextResponse.json({ mapping })
}
