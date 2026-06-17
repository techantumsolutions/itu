import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { aggAudit, aggUpsertOperatorMapping } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { OperatorTrustEngine } from '@/lib/aggregator/catalog-intelligence/trust-engine'
import { logAdminActivity } from '@/lib/auth/audit'

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

  // Dynamic self-learning: Learn from manual mapping in background (non-blocking)
  void (async () => {
    try {
      const [rawOpRes, sysOpRes] = await Promise.all([
        supabaseRest(
          `provider_operator_raw?id=eq.${encodeURIComponent(parsed.data.providerOperatorRawId)}&select=provider_operator_name,country_code&limit=1`,
          { cache: 'no-store' }
        ),
        supabaseRest(
          `system_operators?id=eq.${encodeURIComponent(parsed.data.systemOperatorId)}&select=system_operator_name,country_id&limit=1`,
          { cache: 'no-store' }
        )
      ])

      if (rawOpRes.ok && sysOpRes.ok) {
        const rawOps = await rawOpRes.json()
        const sysOps = await sysOpRes.json()
        
        if (rawOps && rawOps.length > 0 && sysOps && sysOps.length > 0) {
          const rawOpName = rawOps[0].provider_operator_name
          const rawCountry = rawOps[0].country_code || '*'
          const sysOpName = sysOps[0].system_operator_name
          const sysCountry = sysOps[0].country_id || '*'

          // Learn the alias mapping
          await OperatorTrustEngine.learnFromAliasMapping(
            parsed.data.systemOperatorId,
            rawOpName,
            rawCountry,
            'MANUAL_MAPPING'
          )

          // Approve/verify the system operator
          await OperatorTrustEngine.learnFromAdminApproval(
            parsed.data.systemOperatorId,
            sysOpName,
            sysCountry,
            actor?.email ?? 'admin'
          )
        }
      }
    } catch (err) {
      console.error('[MapRoute] Self-learning failed:', err)
    }
  })()

  await aggAudit({
    actor: actor?.email,
    action: 'operator_mapping.approve',
    entityType: 'operator_mapping',
    entityId: mapping?.id,
    after: mapping,
  })

  await logAdminActivity({
    action: 'Map Operator',
    pageName: 'Integrations',
    details: parsed.data,
  })

  return NextResponse.json({ mapping })
}
