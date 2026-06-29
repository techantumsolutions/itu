import { describe, expect, it } from '@jest/globals'
import {
  buildProviderLabelMaps,
  displayProviderLabel,
  displayProviderNamesCsv,
  priorityProviderLabel,
  sortProvidersByPriority,
} from '@/lib/admin/provider-display-labels'

const providers = [
  { id: 'a', code: 'alpha', name: 'Alpha Tel', priority: 2 },
  { id: 'b', code: 'beta', name: 'Beta Mobile', priority: 1 },
  { id: 'c', code: 'gamma', name: 'Gamma', priority: 0 },
]

describe('provider display labels', () => {
  it('sorts priority 0 last', () => {
    const sorted = sortProvidersByPriority(providers)
    expect(sorted.map((p) => p.code)).toEqual(['beta', 'alpha', 'gamma'])
  })

  it('uses P{priority} labels from providers page', () => {
    expect(priorityProviderLabel(1)).toBe('P1')
    expect(priorityProviderLabel(3)).toBe('P3')
  })

  it('masks by id, code, or name', () => {
    const maps = buildProviderLabelMaps(providers)
    expect(displayProviderLabel({ id: 'b' }, maps, false)).toBe('P1')
    expect(displayProviderLabel({ code: 'alpha' }, maps, false)).toBe('P2')
    expect(displayProviderLabel({ name: 'Beta Mobile' }, maps, false)).toBe('P1')
  })

  it('shows real names when enabled', () => {
    const maps = buildProviderLabelMaps(providers)
    expect(displayProviderLabel({ name: 'Beta Mobile' }, maps, true)).toBe('Beta Mobile')
  })

  it('joins masked provider name lists', () => {
    const maps = buildProviderLabelMaps(providers)
    expect(displayProviderNamesCsv(['Alpha Tel', 'Beta Mobile'], maps, false)).toBe('P2, P1')
  })
})
