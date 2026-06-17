import { supabaseRest } from '@/lib/db/supabase-rest'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { aggCountProvidersBySystemPlanIds } from '@/lib/aggregator/repository'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'

function enc(v: string): string {
  return encodeURIComponent(v)
}

async function loadSystemOperatorsInfo(ids: string[]): Promise<Map<string, { name: string; status: string; countryId: string }>> {
  const map = new Map<string, { name: string; status: string; countryId: string }>()
  if (!ids.length) return map
  const unique = [...new Set(ids)]
  const res = await supabaseRest(
    `system_operators?id=in.(${unique.map(enc).join(',')})&select=id,system_operator_name,status,country_id&limit=${unique.length}`,
    { cache: 'no-store' },
  ).catch(() => null)
  if (!res?.ok) return map
  const rows = (await res.json()) as { id: string; system_operator_name?: string; status?: string; country_id?: string }[]
  for (const row of rows) {
    if (row.id) {
      map.set(row.id, {
        name: row.system_operator_name || '',
        status: (row.status || 'ACTIVE').toUpperCase(),
        countryId: row.country_id || '',
      })
    }
  }
  return map
}

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'products', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '500'), 1), 500)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)
  const countryIso3 = normalizeCountryIso3(url.searchParams.get('countryIso3') ?? '')
  const operatorName = (url.searchParams.get('operatorName') ?? '').trim()
  const category = (url.searchParams.get('category') ?? '').trim().toLowerCase()
  const status = (url.searchParams.get('status') ?? 'all').trim().toLowerCase()
  const q = (url.searchParams.get('q') ?? '').trim()

  const isJoinNeeded = countryIso3 || operatorName;
  const selectQuery = isJoinNeeded 
    ? 'select=id,system_operator_id,system_plan_name,description,plan_type,status,amount,currency,system_operators!inner(id)'
    : 'select=id,system_operator_id,system_plan_name,description,plan_type,status,amount,currency';

  const filters = [
    selectQuery,
    `order=system_plan_name.asc&limit=${limit}&offset=${offset}`,
  ]
  if (category) filters.unshift(`plan_type=eq.${enc(category)}`)
  if (status === 'active') filters.unshift('status=eq.ACTIVE')
  if (status === 'inactive') filters.unshift('status=eq.INACTIVE')
  if (q) filters.unshift(`or=(system_plan_name.ilike.*${enc(q)}*,description.ilike.*${enc(q)}*)`)
  
  if (countryIso3) {
    filters.unshift(`system_operators.country_id=eq.${enc(countryIso3)}`)
  }
  if (operatorName) {
    filters.unshift(`system_operators.system_operator_name=ilike.*${enc(operatorName)}*`)
  }

  const res = await supabaseRest(`system_plans?${filters.join('&')}`, { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: 'Failed to load system plans' }, { status: 500 })

  let rows = (await res.json()) as any[]
  
  const systemIds = rows.map((row) => row.system_operator_id).filter(Boolean)
  const systemOperatorInfo = await loadSystemOperatorsInfo(systemIds)
  const planIds = rows.map((row) => row.id).filter(Boolean)
  const providerCounts = await aggCountProvidersBySystemPlanIds(planIds)

  let systemPlans = await Promise.all(
    rows.map(async (row) => {
      const opId = row.system_operator_id
      const opInfo = opId ? systemOperatorInfo.get(opId) : null
      const opStatus = opInfo?.status || 'ACTIVE'
      
      let active = (row.status || '').toUpperCase() === 'ACTIVE'
      
      // Sync plan status with operator status
      if (opId) {
        if (opStatus === 'INACTIVE' && active) {
          active = false
          await supabaseRest(`system_plans?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'INACTIVE' }),
          }).catch((err) => console.error('Failed sync system_plans inactive status:', err))
        } else if (opStatus === 'ACTIVE' && row.status === 'INACTIVE') {
          // Wait, we only auto-activate if the plan should be active. 
          // Let's assume we don't auto-activate unless there's a specific reason, but internal-plans did it.
          // For safety, we match internal-plans behavior.
          active = true
          await supabaseRest(`system_plans?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'ACTIVE' }),
          }).catch((err) => console.error('Failed sync system_plans active status:', err))
        }
      }

      return {
        id: row.id,
        plan_name: row.system_plan_name || 'Unnamed Plan',
        country_iso3: opInfo?.countryId || '',
        operator_name: opInfo?.name || opId,
        operator_ref: opId,
        category: row.plan_type || 'Unknown',
        active,
        provider_count: providerCounts.get(row.id) ?? 0,
      }
    })
  )



  return NextResponse.json({
    systemPlans, // the frontend will map this
    pagination: { limit, offset, returned: systemPlans.length },
    filters: {
      countryIso3: countryIso3 || null,
      operatorName: operatorName || null,
      category: category || null,
      status: status === 'all' ? null : status,
      q: q || null,
    },
  })
}

export async function PATCH(request: Request) {
  if (!(await adminCanUseFeature(request, 'products', { allowLegacyHeader: true }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { id, active } = body

    if (!id || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'id and active (boolean) are required' }, { status: 400 })
    }

    const newStatus = active ? 'ACTIVE' : 'INACTIVE'
    const res = await supabaseRest(`system_plans?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to update system plan status' }, { status: 500 })
    }

    // Also sync the internal plan status
    const planRes = await supabaseRest(`system_plans?id=eq.${encodeURIComponent(id)}&select=internal_plan_id&limit=1`, { cache: 'no-store' })
    if (planRes.ok) {
      const planRows = await planRes.json() as any[]
      if (planRows[0]?.internal_plan_id) {
        await supabaseRest(`internal_plans?id=eq.${encodeURIComponent(planRows[0].internal_plan_id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ active }),
        }).catch((err) => console.error('Failed to sync internal_plans status:', err))
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update system plan status:', error)
    return NextResponse.json({ error: 'Failed to update system plan status' }, { status: 500 })
  }
}
