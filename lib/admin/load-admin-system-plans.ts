import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggCountProvidersBySystemPlanIds,
  aggProviderNamesBySystemPlanIds,
} from '@/lib/aggregator/repository'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type AdminSystemPlanRow = {
  id: string
  plan_name: string
  country_iso3: string
  operator_name: string
  operator_ref: string
  category: string
  active: boolean
  provider_count: number
  provider_names: string[]
}

async function loadSystemOperatorsInfo(
  ids: string[],
): Promise<Map<string, { name: string; status: string; countryId: string }>> {
  const map = new Map<string, { name: string; status: string; countryId: string }>()
  if (!ids.length) return map

  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100)
    const res = await supabaseRest(
      `system_operators?id=in.(${chunk.map(enc).join(',')})&select=id,system_operator_name,status,country_id&limit=${chunk.length}`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (!res?.ok) continue
    const rows = (await res.json()) as Array<{
      id: string
      system_operator_name?: string
      status?: string
      country_id?: string
    }>
    for (const row of rows) {
      if (!row.id) continue
      map.set(row.id, {
        name: row.system_operator_name || '',
        status: (row.status || 'ACTIVE').toUpperCase(),
        countryId: row.country_id || '',
      })
    }
  }
  return map
}

async function resolveOperatorIdsByName(operatorName: string): Promise<string[]> {
  const needle = operatorName.trim()
  if (!needle) return []
  const res = await supabaseRest(
    `system_operators?system_operator_name=ilike.*${enc(needle)}*&select=id&limit=200`,
    { cache: 'no-store' },
  )
  if (!res.ok) return []
  const rows = (await res.json()) as Array<{ id?: string }>
  return rows.map((row) => row.id).filter((id): id is string => Boolean(id))
}

export async function loadAdminSystemPlans(input: {
  limit?: number
  offset?: number
  countryIso3?: string
  operatorName?: string
  category?: string
  status?: string
  q?: string
}): Promise<{
  systemPlans: AdminSystemPlanRow[]
  pagination: { limit: number; offset: number; returned: number }
  filters: {
    countryIso3: string | null
    operatorName: string | null
    category: string | null
    status: string | null
    q: string | null
  }
}> {
  const limit = Math.min(Math.max(input.limit ?? 500, 1), 500)
  const offset = Math.max(input.offset ?? 0, 0)
  const countryIso3 = normalizeCountryIso3(input.countryIso3 ?? '')
  const operatorName = (input.operatorName ?? '').trim()
  const category = (input.category ?? '').trim().toLowerCase()
  const status = (input.status ?? 'all').trim().toLowerCase()
  const q = (input.q ?? '').trim()

  const filters = [
    'select=id,system_operator_id,system_plan_name,description,plan_type,status,amount,currency,country_code',
    `order=system_plan_name.asc&limit=${limit}&offset=${offset}`,
  ]

  if (countryIso3) filters.unshift(`country_code=eq.${enc(countryIso3)}`)
  if (category) filters.unshift(`plan_type=eq.${enc(category)}`)
  if (status === 'active') filters.unshift('status=eq.ACTIVE')
  if (status === 'inactive') filters.unshift('status=eq.INACTIVE')
  if (q) filters.unshift(`or=(system_plan_name.ilike.*${enc(q)}*,description.ilike.*${enc(q)}*)`)

  if (operatorName) {
    const operatorIds = await resolveOperatorIdsByName(operatorName)
    if (!operatorIds.length) {
      return {
        systemPlans: [],
        pagination: { limit, offset, returned: 0 },
        filters: {
          countryIso3: countryIso3 || null,
          operatorName: operatorName || null,
          category: category || null,
          status: status === 'all' ? null : status,
          q: q || null,
        },
      }
    }
    filters.unshift(`system_operator_id=in.(${operatorIds.map(enc).join(',')})`)
  }

  const res = await supabaseRest(`system_plans?${filters.join('&')}`, { cache: 'no-store' })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Failed to load system plans (${res.status}): ${detail}`)
  }

  const rows = (await res.json()) as Array<{
    id: string
    system_operator_id?: string | null
    system_plan_name?: string | null
    plan_type?: string | null
    status?: string | null
    country_code?: string | null
  }>

  const systemIds = rows.map((row) => row.system_operator_id).filter(Boolean) as string[]
  const planIds = rows.map((row) => row.id).filter(Boolean)
  const [systemOperatorInfo, providerCounts, providerNamesByPlan] = await Promise.all([
    loadSystemOperatorsInfo(systemIds),
    aggCountProvidersBySystemPlanIds(planIds),
    aggProviderNamesBySystemPlanIds(planIds),
  ])

  const systemPlans = rows.map((row) => {
    const opId = row.system_operator_id || ''
    const opInfo = opId ? systemOperatorInfo.get(opId) : null
    const opStatus = opInfo?.status || 'ACTIVE'
    const planActive = (row.status || '').toUpperCase() === 'ACTIVE'
    const active = planActive && opStatus !== 'INACTIVE'

    return {
      id: row.id,
      plan_name: row.system_plan_name || 'Unnamed Plan',
      country_iso3: row.country_code || opInfo?.countryId || '',
      operator_name: opInfo?.name || opId,
      operator_ref: opId,
      category: row.plan_type || 'Unknown',
      active,
      provider_count: providerCounts.get(row.id) ?? 0,
      provider_names: providerNamesByPlan.get(row.id) ?? [],
    }
  })

  return {
    systemPlans,
    pagination: { limit, offset, returned: systemPlans.length },
    filters: {
      countryIso3: countryIso3 || null,
      operatorName: operatorName || null,
      category: category || null,
      status: status === 'all' ? null : status,
      q: q || null,
    },
  }
}

export async function patchAdminSystemPlanStatus(input: {
  id: string
  active: boolean
}): Promise<void> {
  const newStatus = input.active ? 'ACTIVE' : 'INACTIVE'
  const res = await supabaseRest(`system_plans?id=eq.${enc(input.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus }),
  })
  if (!res.ok) throw new Error('Failed to update system plan status')

  const planRes = await supabaseRest(
    `system_plans?id=eq.${enc(input.id)}&select=internal_plan_id&limit=1`,
    { cache: 'no-store' },
  )
  if (!planRes.ok) return
  const planRows = (await planRes.json()) as Array<{ internal_plan_id?: string | null }>
  const internalPlanId = planRows[0]?.internal_plan_id
  if (!internalPlanId) return

  await supabaseRest(`internal_plans?id=eq.${enc(internalPlanId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ active: input.active }),
  }).catch((err) => console.error('Failed to sync internal_plans status:', err))
}
