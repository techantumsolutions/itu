import type { ProviderAdapterKey, ProviderConnector } from '@/lib/providers/types'
import { dtoneConnector } from '@/lib/providers/dtone-connector'

const connectors: Record<ProviderAdapterKey, ProviderConnector> = {
  dtone: dtoneConnector,
  ding: {
    adapterKey: 'ding',
    async fetchRawPlans() {
      throw new Error('ding connector not implemented')
    },
    async normalizePlans() {
      throw new Error('ding connector not implemented')
    },
  },
  reloadly: {
    adapterKey: 'reloadly',
    async fetchRawPlans() {
      throw new Error('reloadly connector not implemented')
    },
    async normalizePlans() {
      throw new Error('reloadly connector not implemented')
    },
  },
  custom: {
    adapterKey: 'custom',
    async fetchRawPlans() {
      throw new Error('custom connector not implemented')
    },
    async normalizePlans() {
      throw new Error('custom connector not implemented')
    },
  },
}

export function getConnector(adapterKey: ProviderAdapterKey): ProviderConnector {
  const c = connectors[adapterKey]
  if (!c) throw new Error(`Unknown provider adapter: ${adapterKey}`)
  return c
}

