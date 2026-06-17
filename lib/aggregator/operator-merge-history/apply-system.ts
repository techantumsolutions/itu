import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggMergeSystemOperators } from '@/lib/aggregator/repository'
import { buildStableOperatorMergeKey, mergeKeysEquivalent } from '@/lib/aggregator/merge-keys'
import { normalizeOperatorForRegistry } from '@/lib/aggregator/catalog-intelligence/brand-intelligence'
import { createOperatorMergeHistoryMatcher } from './repository'

const PAGE_SIZE = 1000

function enc(value: string): string {
  return encodeURIComponent(value)
}

function namesEquivalent(a: string, b: string): boolean {
  return (
    normalizeOperatorForRegistry(a) === normalizeOperatorForRegistry(b) ||
    mergeKeysEquivalent(buildStableOperatorMergeKey(a), buildStableOperatorMergeKey(b))
  )
}

type SystemOperatorRow = {
  id: string
  system_operator_name?: string | null
  country_id?: string | null
  status?: string | null
}

async function fetchAllRows<T>(path: string): Promise<T[]> {
  const rows: T[] = []
  let offset = 0

  while (true) {
    const res = await supabaseRest(`${path}&limit=${PAGE_SIZE}&offset=${offset}`, {
      cache: 'no-store',
    })
    if (!res.ok) break
    const page = (await res.json()) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return rows
}

async function loadMappedOperatorIds(providerId: string): Promise<string[]> {
  const rows = await fetchAllRows<{ system_operator_id?: string | null }>(
    `operator_mappings?service_provider_id=eq.${enc(providerId)}&select=system_operator_id`,
  )
  return Array.from(
    new Set(rows.map((row) => row.system_operator_id).filter((id): id is string => Boolean(id))),
  )
}

async function loadOperatorsByIds(ids: string[]): Promise<SystemOperatorRow[]> {
  const operators: SystemOperatorRow[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const res = await supabaseRest(
      `system_operators?id=in.(${chunk.map(enc).join(',')})&select=id,system_operator_name,country_id,status`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    operators.push(...((await res.json()) as SystemOperatorRow[]))
  }
  return operators
}

async function loadOperatorsByCountries(countryIds: string[]): Promise<SystemOperatorRow[]> {
  const operators: SystemOperatorRow[] = []
  for (let i = 0; i < countryIds.length; i += 50) {
    const chunk = countryIds.slice(i, i + 50)
    const rows = await fetchAllRows<SystemOperatorRow>(
      `system_operators?country_id=in.(${chunk.map(enc).join(',')})&select=id,system_operator_name,country_id,status`,
    )
    operators.push(...rows)
  }
  return operators
}

export async function applyOperatorMergeHistoryAtSystemLevel(
  providerId: string,
  actorEmail: string = 'system-sync',
): Promise<{ applied: number; merged: number; skipped: number }> {
  const matcher = await createOperatorMergeHistoryMatcher()
  const mappedIds = await loadMappedOperatorIds(providerId)
  if (!mappedIds.length) return { applied: 0, merged: 0, skipped: 0 }

  const seedOperators = await loadOperatorsByIds(mappedIds)
  const countryIds = Array.from(
    new Set(seedOperators.map((op) => op.country_id).filter((id): id is string => Boolean(id))),
  )
  if (!countryIds.length) return { applied: 0, merged: 0, skipped: 0 }

  const operators = await loadOperatorsByCountries(countryIds)
  const deactivated = new Set<string>()
  let applied = 0
  let merged = 0
  let skipped = 0

  for (const op of operators) {
    if (deactivated.has(op.id)) continue

    const operatorName = String(op.system_operator_name ?? '').trim()
    const countryIso3 = String(op.country_id ?? '').trim().toUpperCase()
    if (!operatorName || !countryIso3) {
      skipped++
      continue
    }

    const historyMatch = matcher.match(operatorName, countryIso3)
    if (!historyMatch) continue

    if (historyMatch.row.countryIso3 !== countryIso3) {
      console.log(
        `[history][skip] Country mismatch source=${operatorName} historyCountry=${historyMatch.row.countryIso3} operatorCountry=${countryIso3}`,
      )
      skipped++
      continue
    }

    const targetName = historyMatch.row.targetOperatorName
    const targetMergeKey =
      historyMatch.row.targetMergeKey ||
      historyMatch.row.targetOperatorNormalized ||
      buildStableOperatorMergeKey(targetName)

    if (
      namesEquivalent(operatorName, targetName) ||
      mergeKeysEquivalent(buildStableOperatorMergeKey(operatorName), targetMergeKey)
    ) {
      skipped++
      continue
    }

    const canonical = operators.find(
      (candidate) =>
        candidate.id !== op.id &&
        !deactivated.has(candidate.id) &&
        String(candidate.country_id ?? '').toUpperCase() === countryIso3 &&
        (namesEquivalent(String(candidate.system_operator_name ?? ''), targetName) ||
          mergeKeysEquivalent(
            buildStableOperatorMergeKey(String(candidate.system_operator_name ?? '')),
            targetMergeKey,
          )),
    )

    if (!canonical?.id) {
      console.log(
        `[history][skip] Canonical system operator not found source=${operatorName} target=${targetName} country=${countryIso3}`,
      )
      skipped++
      continue
    }

    try {
      const result = await aggMergeSystemOperators(canonical.id, [op.id], actorEmail)
      if (result.success) {
        deactivated.add(op.id)
        merged++
        applied++
        console.log(
          `[history][operator] Applied merge history source=${operatorName} target=${targetName} country=${countryIso3} layer=system`,
        )
      }
    } catch (err) {
      console.error('[history][operator] Failed system-level merge:', err)
      skipped++
    }
  }

  return { applied, merged, skipped }
}
