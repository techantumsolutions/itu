/** LCR provider row fields used for P{n} masking (matches providers page Config column). */
export type ProviderLabelSource = {
  id: string
  code: string
  name: string
  priority: number
}

export type ProviderLabelInput = {
  id?: string | null
  code?: string | null
  name?: string | null
}

export type ProviderLabelMaps = {
  byId: Map<string, string>
  byCode: Map<string, string>
  byName: Map<string, string>
}

/** Same sort as providers page: priority 0 last, then ascending priority. */
export function sortProvidersByPriority<T extends { priority: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.priority === 0 && b.priority === 0) return 0
    if (a.priority === 0) return 1
    if (b.priority === 0) return -1
    return a.priority - b.priority
  })
}

/** Config column label on the providers page. */
export function priorityProviderLabel(priority: number): string {
  return `P${priority}`
}

export function buildProviderLabelMaps(providers: ProviderLabelSource[]): ProviderLabelMaps {
  const byId = new Map<string, string>()
  const byCode = new Map<string, string>()
  const byName = new Map<string, string>()

  for (const p of providers) {
    const label = priorityProviderLabel(p.priority)
    byId.set(p.id, label)
    if (p.code?.trim()) byCode.set(p.code.trim().toLowerCase(), label)
    if (p.name?.trim()) byName.set(p.name.trim().toLowerCase(), label)
  }

  return { byId, byCode, byName }
}

function lookupMaskedLabel(input: ProviderLabelInput, maps: ProviderLabelMaps): string | null {
  const id = input.id?.trim()
  if (id && maps.byId.has(id)) return maps.byId.get(id)!

  const code = input.code?.trim().toLowerCase()
  if (code && maps.byCode.has(code)) return maps.byCode.get(code)!

  const name = input.name?.trim().toLowerCase()
  if (name && maps.byName.has(name)) return maps.byName.get(name)!

  return null
}

function realProviderLabel(input: ProviderLabelInput): string {
  const name = input.name?.trim()
  if (name) return name
  const code = input.code?.trim()
  if (code) return code
  const id = input.id?.trim()
  if (id) return id.length > 12 ? `${id.slice(0, 8)}…` : id
  return '—'
}

export function displayProviderLabel(
  input: ProviderLabelInput,
  maps: ProviderLabelMaps,
  showNames: boolean,
): string {
  if (showNames) return realProviderLabel(input)
  return lookupMaskedLabel(input, maps) ?? '—'
}

export function displayProviderNamesCsv(
  names: string[],
  maps: ProviderLabelMaps,
  showNames: boolean,
): string {
  const filtered = names.map((n) => n?.trim()).filter(Boolean) as string[]
  if (filtered.length === 0) return '—'
  if (showNames) return filtered.join(', ')
  const labels = filtered.map((name) =>
    displayProviderLabel({ name }, maps, false),
  )
  const unique = [...new Set(labels)]
  return unique.join(', ')
}
