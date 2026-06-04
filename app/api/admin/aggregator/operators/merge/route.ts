import { NextResponse } from 'next/server'
import { z } from 'zod'
import { adminCanManageProviders } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggAudit } from '@/lib/aggregator/repository'
import { getRequestUser } from '@/lib/tickets/auth-headers'

const mergeSchema = z.object({
  targetOperatorId: z.string().uuid(),
  sourceOperatorIds: z.array(z.string().uuid()).nonempty(),
})

export async function POST(request: Request) {
  if (!(await adminCanManageProviders(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = mergeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid merge payload', issues: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { targetOperatorId, sourceOperatorIds } = parsed.data

  if (sourceOperatorIds.includes(targetOperatorId)) {
    return NextResponse.json(
      { error: 'Target operator cannot be in the list of source operators to merge' },
      { status: 400 }
    )
  }

  try {
    // 1. Verify target operator exists
    const targetRes = await supabaseRest(
      `system_operators?id=eq.${encodeURIComponent(targetOperatorId)}&select=*&limit=1`,
      { cache: 'no-store' }
    )
    if (!targetRes.ok) throw new Error(`Failed to check target operator: ${await targetRes.text()}`)
    const targetRows = await targetRes.json() as any[]
    if (targetRows.length === 0) {
      return NextResponse.json({ error: 'Target operator not found' }, { status: 404 })
    }
    const targetOperator = targetRows[0]

    const actor = getRequestUser(request)
    const logs: string[] = []

    // 2. Process each source operator
    for (const sourceId of sourceOperatorIds) {
      // Get source operator info for logging/audit
      const sourceRes = await supabaseRest(
        `system_operators?id=eq.${encodeURIComponent(sourceId)}&select=*&limit=1`,
        { cache: 'no-store' }
      )
      if (!sourceRes.ok) continue
      const sourceRows = await sourceRes.json() as any[]
      if (sourceRows.length === 0) continue
      const sourceOperator = sourceRows[0]

      // Fetch all system plans for the source operator
      const plansRes = await supabaseRest(
        `system_plans?system_operator_id=eq.${encodeURIComponent(sourceId)}&select=*`,
        { cache: 'no-store' }
      )
      if (plansRes.ok) {
        const plans = await plansRes.json() as any[]
        for (const sp of plans) {
          // Check if target operator already has a plan with the same signature
          const existingPlanRes = await supabaseRest(
            `system_plans?system_operator_id=eq.${encodeURIComponent(
              targetOperatorId
            )}&normalized_signature=eq.${encodeURIComponent(sp.normalized_signature)}&select=*&limit=1`,
            { cache: 'no-store' }
          )
          if (existingPlanRes.ok) {
            const existingPlanRows = await existingPlanRes.json() as any[]
            if (existingPlanRows.length > 0) {
              const targetSp = existingPlanRows[0]
              // Update plan mappings
              await supabaseRest(
                `plan_mappings?system_plan_id=eq.${encodeURIComponent(sp.id)}`,
                {
                  method: 'PATCH',
                  body: JSON.stringify({ system_plan_id: targetSp.id }),
                }
              )
              // Update duplicate plan suggestions
              await supabaseRest(
                `duplicate_plan_suggestions?suggested_system_plan_id=eq.${encodeURIComponent(sp.id)}`,
                {
                  method: 'PATCH',
                  body: JSON.stringify({ suggested_system_plan_id: targetSp.id }),
                }
              )
              // Delete duplicate source plan
              await supabaseRest(`system_plans?id=eq.${encodeURIComponent(sp.id)}`, {
                method: 'DELETE',
              })
              continue
            }
          }

          // If no signature conflict, update the system operator ID of the plan
          await supabaseRest(`system_plans?id=eq.${encodeURIComponent(sp.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ system_operator_id: targetOperatorId }),
          })
        }
      }

      // Remap raw operators mappings
      await supabaseRest(`operator_mappings?system_operator_id=eq.${encodeURIComponent(sourceId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ system_operator_id: targetOperatorId }),
      })

      // Remap system operator lineage safely
      const lineageRes = await supabaseRest(
        `system_operator_lineage?system_operator_id=eq.${encodeURIComponent(sourceId)}&select=*`,
        { cache: 'no-store' }
      )
      if (lineageRes.ok) {
        const lineages = await lineageRes.json() as any[]
        for (const lin of lineages) {
          // Check if target operator already has this lineage
          const targetLinRes = await supabaseRest(
            `system_operator_lineage?system_operator_id=eq.${encodeURIComponent(
              targetOperatorId
            )}&aggregate_operator_id=eq.${encodeURIComponent(lin.aggregate_operator_id)}&select=id&limit=1`,
            { cache: 'no-store' }
          )
          if (targetLinRes.ok) {
            const targetLinRows = await targetLinRes.json() as any[]
            if (targetLinRows.length > 0) {
              // Delete source lineage as it is a duplicate
              await supabaseRest(`system_operator_lineage?id=eq.${encodeURIComponent(lin.id)}`, {
                method: 'DELETE',
              })
              continue
            }
          }
          // Update lineage to point to target operator
          await supabaseRest(`system_operator_lineage?id=eq.${encodeURIComponent(lin.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ system_operator_id: targetOperatorId }),
          })
        }
      }

      // Remap operator_ref in internal_plans
      try {
        await supabaseRest(
          `internal_plans?operator_ref=eq.system:${encodeURIComponent(sourceId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              operator_ref: `system:${targetOperatorId}`,
            }),
          }
        )
      } catch (err) {
        console.warn(`Failed to update internal plans for source operator ${sourceId}:`, err)
      }

      // Delete the source operator
      await supabaseRest(`system_operators?id=eq.${encodeURIComponent(sourceId)}`, {
        method: 'DELETE',
      })

      logs.push(`Merged system operator '${sourceOperator.system_operator_name}' (${sourceId}) into '${targetOperator.system_operator_name}' (${targetOperatorId})`)
    }

    // Audit Log
    await aggAudit({
      actor: actor?.email ?? 'admin',
      action: 'operators.merge',
      entityType: 'system_operator',
      entityId: targetOperatorId,
      after: targetOperator,
      details: {
        targetOperatorId,
        sourceOperatorIds,
        logs,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, logs })
  } catch (error: any) {
    console.error('[operators/merge]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to merge operators' },
      { status: 500 }
    )
  }
}
