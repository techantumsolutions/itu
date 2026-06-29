import { NextResponse } from 'next/server'
import { adminCanUseFeature } from '@/lib/auth/require-admin-feature'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'
import {
  displayPlanName,
  internalPlansDefaultOrder,
  operatorNameFromInternalPlan,
  type InternalPlanRow,
} from '@/lib/lcr/internal-plan-display'

function enc(v: string): string {
  return encodeURIComponent(v)
}

async function loadSystemOperatorsInfo(ids: string[]): Promise<Map<string, { name: string; status: string }>> {
  const map = new Map<string, { name: string; status: string }>()
  if (!ids.length) return map
  const unique = [...new Set(ids)]
  const res = await supabaseRest(
    `system_operators?id=in.(${unique.map(enc).join(',')})&select=id,system_operator_name,status&limit=${unique.length}`,
    { cache: 'no-store' },
  ).catch(() => null)
  if (!res?.ok) return map
  const rows = (await res.json()) as { id: string; system_operator_name?: string; status?: string }[]
  for (const row of rows) {
    if (row.id) {
      map.set(row.id, {
        name: row.system_operator_name || '',
        status: (row.status || 'ACTIVE').toUpperCase(),
      })
    }
  }
  return map
}

export async function GET(request: Request) {
  if (!(await adminCanUseFeature(request, 'products'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '500'), 1), 500)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0)
  const countryIso3 = normalizeCountryIso3(url.searchParams.get('countryIso3') ?? '')
  const operatorRef = (url.searchParams.get('operatorRef') ?? '').trim()
  const operatorName = (url.searchParams.get('operatorName') ?? '').trim()
  const category = (url.searchParams.get('category') ?? '').trim().toLowerCase()
  const status = (url.searchParams.get('status') ?? 'all').trim().toLowerCase()
  const q = (url.searchParams.get('q') ?? '').trim()

  const filters = [
    'select=id,country_iso3,operator_ref,service,subservice,category,uti_plan_name,uti_description,active,raw_response',
    `order=${internalPlansDefaultOrder()}&limit=${limit}&offset=${offset}`,
  ]
  if (countryIso3) filters.unshift(`country_iso3=eq.${enc(countryIso3)}`)
  if (operatorRef) filters.unshift(`operator_ref=eq.${enc(operatorRef)}`)
  if (category) filters.unshift(`category=eq.${enc(category)}`)
  if (status === 'active') filters.unshift('active=eq.true')
  if (status === 'inactive') filters.unshift('active=eq.false')
  if (q) filters.unshift(`or=(uti_plan_name.ilike.*${enc(q)}*,uti_description.ilike.*${enc(q)}*)`)

  const res = await supabaseRest(`internal_plans?${filters.join('&')}`, { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: 'Failed to load internal plans' }, { status: 500 })

  let rows = (await res.json()) as InternalPlanRow[]
  const systemIds = rows
    .map((row) => (row.operator_ref?.startsWith('system:') ? row.operator_ref.slice('system:'.length) : ''))
    .filter(Boolean)
  const systemOperatorInfo = await loadSystemOperatorsInfo(systemIds)

  const systemOperatorNames = new Map<string, string>()
  for (const [key, value] of systemOperatorInfo.entries()) {
    systemOperatorNames.set(key, value.name)
  }

  const internalPlansRaw = rows.map((row) => {
    const opId = row.operator_ref?.startsWith('system:') ? row.operator_ref.slice('system:'.length) : ''
    const opInfo = opId ? systemOperatorInfo.get(opId) : null
    const opStatus = opInfo?.status || 'ACTIVE'

    return {
      row,
      opId,
      opStatus,
    }
  })

  // Synchronize plan active status with operator active status
  let internalPlans = await Promise.all(
    internalPlansRaw.map(async ({ row, opId, opStatus }) => {
      let active = row.active
      if (opId) {
        if (opStatus === 'INACTIVE' && row.active) {
          active = false
          // Update DB internal_plans
          await supabaseRest(`internal_plans?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: false }),
          }).catch((err) => console.error('Failed sync internal_plans inactive status:', err))
          // Update DB system_plans
          await supabaseRest(`system_plans?internal_plan_id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'INACTIVE' }),
          }).catch((err) => console.error('Failed sync system_plans inactive status:', err))
        } else if (opStatus === 'ACTIVE' && !row.active) {
          active = true
          // Update DB internal_plans
          await supabaseRest(`internal_plans?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: true }),
          }).catch((err) => console.error('Failed sync internal_plans active status:', err))
          // Update DB system_plans
          await supabaseRest(`system_plans?internal_plan_id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'ACTIVE' }),
          }).catch((err) => console.error('Failed sync system_plans active status:', err))
        }
      }

      return {
        id: row.id,
        plan_name: displayPlanName(row),
        country_iso3: row.country_iso3,
        operator_name: operatorNameFromInternalPlan(row, systemOperatorNames),
        operator_ref: row.operator_ref,
        category: row.category,
        active,
      }
    })
  )

  if (operatorName) {
    const needle = operatorName.toLowerCase()
    internalPlans = internalPlans.filter((row) => row.operator_name.toLowerCase().includes(needle))
  }

  return NextResponse.json({
    internalPlans,
    pagination: { limit, offset, returned: internalPlans.length },
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
  if (!(await adminCanUseFeature(request, 'products'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { id, active } = body

    if (!id || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'id and active (boolean) are required' }, { status: 400 })
    }

    const res = await supabaseRest(`internal_plans?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to update plan status' }, { status: 500 })
    }

    // Update corresponding system plan status
    await supabaseRest(`system_plans?internal_plan_id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: active ? 'ACTIVE' : 'INACTIVE' }),
    }).catch((err) => console.error('Failed to sync system_plans status:', err))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update plan status:', error)
    return NextResponse.json({ error: 'Failed to update plan status' }, { status: 500 })
  }
}
